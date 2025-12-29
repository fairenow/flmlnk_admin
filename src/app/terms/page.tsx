import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | FLMLNK",
  description: "Review the terms of service that govern your use of FLMLNK.",
};

const termsSections = [
  {
    title: "1. Acceptance of Terms",
    content: `By accessing or using the FLMLNK platform ("Service"), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service ("Terms") and our Privacy Policy. If you are using the Service on behalf of an organization, you represent and warrant that you have the authority to bind that organization to these Terms. If you do not agree to these Terms, you must immediately discontinue use of the Service.`,
  },
  {
    title: "2. Eligibility",
    content: `You must be at least 18 years of age or the age of legal majority in your jurisdiction to use FLMLNK. By using the Service, you represent and warrant that you meet these eligibility requirements. If you are under 18, you may only use the Service with the involvement of a parent or legal guardian who agrees to be bound by these Terms.`,
  },
  {
    title: "3. Account Registration and Security",
    content: `To access certain features of the Service, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete. You are solely responsible for safeguarding your account credentials and for all activities that occur under your account. You must immediately notify FLMLNK of any unauthorized use of your account or any other breach of security. FLMLNK will not be liable for any loss or damage arising from your failure to comply with these security obligations.`,
  },
  {
    title: "4. Use of the Service",
    content: `Subject to your compliance with these Terms, FLMLNK grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for your personal or internal business purposes. You agree to use the Service only for lawful purposes and in accordance with these Terms. You shall not: (a) sublicense, sell, resell, transfer, assign, or distribute the Service; (b) modify or make derivative works based upon the Service; (c) reverse engineer or access the Service to build a competitive product or service; (d) use the Service to send spam or unsolicited communications; or (e) access the Service through automated means without our express written consent.`,
  },
  {
    title: "5. User Content and Intellectual Property",
    content: `You retain all ownership rights in the content you upload, submit, or display through the Service ("User Content"). By posting User Content, you grant FLMLNK a worldwide, non-exclusive, royalty-free license to use, host, store, reproduce, modify, create derivative works, communicate, publish, publicly display, and distribute such User Content solely for the purpose of operating, developing, and improving the Service. You represent and warrant that you own or have the necessary licenses, rights, consents, and permissions to grant the foregoing license and that your User Content does not infringe or violate the intellectual property rights or other rights of any third party.`,
  },
  {
    title: "6. FLMLNK Intellectual Property",
    content: `The Service and its original content (excluding User Content), features, and functionality are and will remain the exclusive property of FLMLNK and its licensors. The Service is protected by copyright, trademark, and other laws of both the United States and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of FLMLNK. Nothing in these Terms grants you any right to use the FLMLNK name, logos, domain names, or other distinctive brand features.`,
  },
  {
    title: "7. Prohibited Activities",
    content: `You agree not to engage in any of the following prohibited activities: (a) copying, distributing, or disclosing any part of the Service in any medium; (b) using any automated system to access the Service; (c) transmitting spam, chain letters, or other unsolicited communications; (d) attempting to interfere with or compromise the system integrity or security; (e) uploading invalid data, viruses, worms, or other malicious software; (f) collecting or harvesting any personally identifiable information from the Service; (g) using the Service for any commercial solicitation purposes without our consent; (h) impersonating another person or otherwise misrepresenting your affiliation; (i) interfering with the proper working of the Service; (j) accessing content through any technology other than provided by the Service; or (k) bypassing measures used to prevent or restrict access to the Service.`,
  },
  {
    title: "8. Subscription and Payment Terms",
    content: `Certain features of the Service may require payment of fees. By subscribing to a paid plan, you agree to pay all applicable fees as described on the Service. All fees are non-refundable except as expressly set forth herein or as required by applicable law. FLMLNK reserves the right to change its fees upon thirty (30) days' notice. Your continued use of the Service after the fee change becomes effective constitutes your agreement to pay the modified fee amount. If you dispute any charge, you must notify FLMLNK within thirty (30) days of the date of the charge.`,
  },
  {
    title: "9. Free Trial",
    content: `FLMLNK may offer a free trial period for certain subscription plans. At the end of the free trial, your account will automatically convert to a paid subscription unless you cancel before the trial ends. You may be required to provide payment information to start a free trial. FLMLNK reserves the right to modify or terminate free trial offers at any time without notice.`,
  },
  {
    title: "10. Termination",
    content: `You may terminate your account at any time by contacting us or through the account settings. FLMLNK may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach these Terms. Upon termination, your right to use the Service will immediately cease. All provisions of these Terms which by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnification, and limitations of liability.`,
  },
  {
    title: "11. Disclaimer of Warranties",
    content: `THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE. FLMLNK DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE, THAT THE RESULTS OBTAINED FROM THE USE OF THE SERVICE WILL BE ACCURATE OR RELIABLE, OR THAT THE QUALITY OF ANY PRODUCTS, SERVICES, INFORMATION, OR OTHER MATERIAL OBTAINED THROUGH THE SERVICE WILL MEET YOUR EXPECTATIONS.`,
  },
  {
    title: "12. Limitation of Liability",
    content: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL FLMLNK, ITS AFFILIATES, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, PUNITIVE, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO THE USE OF, OR INABILITY TO USE, THE SERVICE. IN NO EVENT SHALL FLMLNK'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE EXCEED THE AMOUNT PAID BY YOU TO FLMLNK DURING THE TWELVE (12) MONTHS PRIOR TO THE EVENT GIVING RISE TO SUCH LIABILITY, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.`,
  },
  {
    title: "13. Indemnification",
    content: `You agree to defend, indemnify, and hold harmless FLMLNK and its affiliates, licensors, and service providers, and its and their respective officers, directors, employees, contractors, agents, licensors, suppliers, successors, and assigns from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to your violation of these Terms or your use of the Service, including but not limited to your User Content, any use of the Service's content other than as expressly authorized in these Terms, or your use of any information obtained from the Service.`,
  },
  {
    title: "14. Governing Law and Dispute Resolution",
    content: `These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions. Any dispute arising from or relating to these Terms or the Service shall be resolved through binding arbitration administered by the American Arbitration Association in accordance with its Commercial Arbitration Rules. The arbitration shall take place in Delaware, and the arbitrator's decision shall be final and binding. You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.`,
  },
  {
    title: "15. Changes to Terms",
    content: `FLMLNK reserves the right to modify or replace these Terms at any time at our sole discretion. If a revision is material, we will provide at least thirty (30) days' notice prior to any new terms taking effect, either through the Service interface, by email, or by other reasonable means. What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms. If you do not agree to the new terms, please stop using the Service.`,
  },
  {
    title: "16. Severability",
    content: `If any provision of these Terms is held to be unenforceable or invalid, such provision will be changed and interpreted to accomplish the objectives of such provision to the greatest extent possible under applicable law, and the remaining provisions will continue in full force and effect.`,
  },
  {
    title: "17. Entire Agreement",
    content: `These Terms, together with the Privacy Policy and any other legal notices published by FLMLNK on the Service, constitute the entire agreement between you and FLMLNK concerning the Service and supersede all prior agreements, understandings, negotiations, and discussions, whether oral or written, between the parties.`,
  },
  {
    title: "18. Contact Information",
    content: `If you have any questions about these Terms of Service, please contact us at support@flmlnk.com or through the contact form on our website.`,
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/10 via-transparent to-red-900/5 blur-3xl" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="flex items-center gap-3 text-sm text-gray-400 mb-4">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-white">Terms of Service</span>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-red-400">Legal</p>
              <h1 className="text-3xl sm:text-4xl font-semibold">Terms of Service</h1>
              <p className="text-gray-400 max-w-2xl">
                These Terms of Service ("Terms") govern your access to and use of the FLMLNK platform and services.
                Please read these Terms carefully before using our Service.
              </p>
              <p className="text-sm text-gray-500">Last updated: December 2024</p>
            </div>

            <div className="grid gap-4">
              {termsSections.map((section) => (
                <section
                  key={section.title}
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 shadow-lg shadow-red-900/10"
                >
                  <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-line">{section.content}</p>
                </section>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-red-600/20 to-red-800/20 p-6">
              <h3 className="text-lg font-semibold mb-2">Questions About These Terms?</h3>
              <p className="text-gray-300">
                If you have any questions about these Terms of Service, please contact us at{" "}
                <a href="mailto:support@flmlnk.com" className="text-red-300 hover:text-red-200 underline">
                  support@flmlnk.com
                </a>
                . We recommend that you print or save a copy of these Terms for your records.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
