import { UploadCloud } from "lucide-react";

export default function UploadCard() {
  return (
    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10">
        <UploadCloud size={34} className="text-white/80" />
      </div>

      <h3 className="mt-6 text-3xl font-semibold">Upload New Dataset</h3>
      <p className="mt-3 text-white/60 leading-relaxed">
        Drop your CSV or JSON files here to start a high-precision AI analysis session.
      </p>

      <button className="mt-8 w-full rounded-xl bg-gray-600 text-white py-3 font-medium hover:bg-black transition">
        Browse Files
      </button>
    </div>
  );
}