/**
 * DOM Polyfills for Convex Runtime
 *
 * AWS SDK v3 uses DOMParser and Node constants for XML parsing in browser environments.
 * Convex's runtime is Node.js-like but doesn't have these DOM APIs.
 * This polyfill uses fast-xml-parser to provide DOMParser-like functionality
 * and defines the Node constant interface for DOM node type checking.
 *
 * IMPORTANT: This file MUST be imported before any AWS SDK imports.
 */

import { XMLParser } from "fast-xml-parser";

// =============================================================================
// NODE CONSTANT POLYFILL
// =============================================================================

/**
 * DOM Node type constants.
 * These are used by AWS SDK's XML parser to check node types.
 * See: https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
 */
const NodePolyfill = {
  ELEMENT_NODE: 1,
  ATTRIBUTE_NODE: 2,
  TEXT_NODE: 3,
  CDATA_SECTION_NODE: 4,
  ENTITY_REFERENCE_NODE: 5,
  ENTITY_NODE: 6,
  PROCESSING_INSTRUCTION_NODE: 7,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9,
  DOCUMENT_TYPE_NODE: 10,
  DOCUMENT_FRAGMENT_NODE: 11,
  NOTATION_NODE: 12,
};

// Install Node polyfill globally if Node doesn't exist
if (typeof globalThis !== "undefined" && !("Node" in globalThis)) {
  (globalThis as Record<string, unknown>).Node = NodePolyfill;
}

// =============================================================================
// DOMPARSER POLYFILL
// =============================================================================

const fastXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  trimValues: false, // Preserve whitespace - AWS SDK may need it
  preserveOrder: false,
});

// Minimal DOMParser polyfill for AWS SDK v3
class DOMParserPolyfill {
  parseFromString(xmlString: string, _mimeType: string): Document {
    // Log the raw XML being parsed for debugging
    console.log("[DOMParser] Parsing XML:", xmlString.substring(0, 500));

    const parsed = fastXmlParser.parse(xmlString);

    // Log the parsed structure
    console.log("[DOMParser] Parsed structure:", JSON.stringify(parsed, null, 2));

    return createMinimalDocument(parsed, xmlString);
  }
}

// Create a minimal Document object from parsed XML
function createMinimalDocument(
  parsed: Record<string, unknown>,
  originalXml: string
): Document {
  // Find the actual root element, skipping XML declaration and processing instructions
  // fast-xml-parser includes "?xml" for <?xml ?> declarations which we need to skip
  const keys = Object.keys(parsed);
  const rootKey = keys.find((key) => !key.startsWith("?")) || keys[0] || "root";
  const rootValue = parsed[rootKey];
  const documentElement = createElementFromParsed(rootValue, rootKey, originalXml);

  // Document's childNodes contains the document element (and potentially XML declaration, etc.)
  // For our purposes, we just need the root element
  const childNodes = [documentElement];

  const doc = {
    nodeType: NodePolyfill.DOCUMENT_NODE, // 9
    nodeName: "#document",
    childNodes, // AWS SDK may iterate document.childNodes
    documentElement,
    firstChild: documentElement,
    getElementsByTagName: (tagName: string): Element[] => {
      const elements: Element[] = [];
      findElements(parsed, tagName, elements, originalXml);
      return elements;
    },
    hasChildNodes: () => true,
  } as unknown as Document;
  return doc;
}

function findElements(
  obj: unknown,
  tagName: string,
  results: Element[],
  originalXml: string
): void {
  if (!obj || typeof obj !== "object") return;

  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === tagName) {
      const value = record[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          results.push(createElementFromParsed(item, key, originalXml));
        }
      } else {
        results.push(createElementFromParsed(value, key, originalXml));
      }
    }
    if (typeof record[key] === "object" && record[key] !== null) {
      findElements(record[key], tagName, results, originalXml);
    }
  }
}

/**
 * Create a text node compatible with AWS SDK XML parser.
 * Text nodes have nodeType=3 and store content in nodeValue.
 * Includes empty childNodes and attributes for completeness.
 */
function createTextNode(text: string): unknown {
  return {
    nodeType: NodePolyfill.TEXT_NODE, // 3
    nodeValue: text,
    textContent: text,
    nodeName: "#text",
    "#text": text, // Some AWS SDK code paths check this directly
    childNodes: [], // Text nodes have no children, but property must exist
    attributes: [], // Text nodes have no attributes, but property must exist
    firstChild: null,
    hasChildNodes: () => false,
  };
}

/**
 * Create an attribute node for the attributes collection.
 * AWS SDK's xmlToObj iterates attributes[i] expecting name/value properties.
 */
interface AttributeNode {
  name: string;
  value: string;
  nodeName: string;
  nodeValue: string;
  nodeType: number;
}

/**
 * Create an attributes collection (NamedNodeMap-like) from parsed attributes.
 * AWS SDK's xml-parser.browser.js accesses attributes.length and attributes[i].
 */
function createAttributesCollection(
  value: unknown
): AttributeNode[] & { getNamedItem: (name: string) => AttributeNode | null } {
  const attrs: AttributeNode[] = [];

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key.startsWith("@_")) {
        const attrName = key.substring(2); // Remove @_ prefix
        const attrValue = String(record[key] ?? "");
        attrs.push({
          name: attrName,
          value: attrValue,
          nodeName: attrName,
          nodeValue: attrValue,
          nodeType: NodePolyfill.ATTRIBUTE_NODE, // 2
        });
      }
    }
  }

  // Add getNamedItem method for compatibility
  const collection = attrs as AttributeNode[] & {
    getNamedItem: (name: string) => AttributeNode | null;
  };
  collection.getNamedItem = (name: string): AttributeNode | null => {
    return attrs.find((attr) => attr.name === name) || null;
  };

  return collection;
}

/**
 * Create an element node from parsed XML data.
 * Properly implements childNodes and attributes with length property
 * to satisfy AWS SDK's xml-parser.browser.js requirements.
 */
function createElementFromParsed(
  value: unknown,
  tagName: string,
  originalXml: string
): Element {
  // Build childNodes array - this is what AWS SDK iterates over
  const childNodes: unknown[] = [];

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;

    // Process all properties to build childNodes
    for (const key of Object.keys(record)) {
      // Skip attributes (prefixed with @_)
      if (key.startsWith("@_")) continue;

      // Handle text content
      if (key === "#text") {
        const textValue = record[key];
        if (textValue !== undefined && textValue !== null && textValue !== "") {
          childNodes.push(createTextNode(String(textValue)));
        }
        continue;
      }

      // Handle child elements
      const childValue = record[key];
      if (Array.isArray(childValue)) {
        // Multiple children with same tag name
        for (const item of childValue) {
          childNodes.push(createElementFromParsed(item, key, originalXml));
        }
      } else if (childValue !== undefined && childValue !== null) {
        // Single child element
        childNodes.push(createElementFromParsed(childValue, key, originalXml));
      }
    }
  } else if (value !== undefined && value !== null && value !== "") {
    // Primitive value - treat as text content
    childNodes.push(createTextNode(String(value)));
  }

  // Calculate textContent from all text nodes in childNodes
  const textContent = childNodes
    .filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as Record<string, unknown>).nodeType === NodePolyfill.TEXT_NODE
    )
    .map((node) => (node as Record<string, unknown>).nodeValue || "")
    .join("");

  // Get first child and first element child for convenience
  const firstChild = childNodes.length > 0 ? childNodes[0] : null;
  const elementChildren = childNodes.filter(
    (node) =>
      node &&
      typeof node === "object" &&
      (node as Record<string, unknown>).nodeType === NodePolyfill.ELEMENT_NODE
  );

  // Create attributes collection - AWS SDK accesses attributes.length and attributes[i]
  const attributes = createAttributesCollection(value);

  return {
    nodeType: NodePolyfill.ELEMENT_NODE, // 1
    tagName,
    nodeName: tagName,
    textContent,
    innerHTML: textContent,
    firstChild,
    childNodes,
    children: elementChildren,
    attributes, // NamedNodeMap-like collection with .length
    getAttribute: (name: string): string | null => {
      if (typeof value === "object" && value !== null) {
        const attrValue = (value as Record<string, unknown>)[`@_${name}`];
        return attrValue !== undefined && attrValue !== null
          ? String(attrValue)
          : null;
      }
      return null;
    },
    getElementsByTagName: (childTag: string): Element[] => {
      const elements: Element[] = [];
      if (typeof value === "object" && value !== null) {
        findElements(value, childTag, elements, originalXml);
      }
      return elements;
    },
    hasChildNodes: () => childNodes.length > 0,
  } as unknown as Element;
}

// Install polyfill globally if DOMParser doesn't exist
if (typeof globalThis !== "undefined" && !("DOMParser" in globalThis)) {
  (globalThis as Record<string, unknown>).DOMParser = DOMParserPolyfill;
}

// Export markers to indicate the polyfills are loaded
export const DOM_PARSER_POLYFILL_LOADED = true;
export const NODE_POLYFILL_LOADED = true;
