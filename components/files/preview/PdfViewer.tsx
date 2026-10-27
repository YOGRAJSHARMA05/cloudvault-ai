"use client";

export default function PdfViewer({ url }: { url: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
      <object
        data={url}
        type="application/pdf"
        className="h-[70vh] w-full min-h-[500px]"
      >
        <div className="flex min-h-[400px] flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-medium text-white">Unable to display PDF inline</p>
          <p className="mt-2 text-sm text-slate-400">Your browser may not support inline PDF viewing.</p>
          <a
            className="mt-4 text-sm font-medium text-blue-300 hover:text-blue-200"
            href={url}
            download
          >
            Download PDF
          </a>
        </div>
      </object>
    </div>
  );
}
