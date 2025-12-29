import { buildPublicPageUrl } from "@/lib/siteUrl";

type ActorPagePreviewProps = {
  slug: string;
};

export function ActorPagePreview({ slug }: ActorPagePreviewProps) {
  if (!slug) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Add a slug to your profile to preview the page.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <iframe
        key={slug}
        src={buildPublicPageUrl(slug)}
        className="h-[620px] w-full border-0 md:h-[720px]"
        title="Actor page preview"
        loading="lazy"
      />
    </div>
  );
}
