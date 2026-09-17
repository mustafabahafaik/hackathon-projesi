"use client";

import { inCountText, outCountText } from "@/lib/derive";
import { useStore } from "@/lib/store";
import type { Photo } from "@/lib/types";

/**
 * Move-in and move-out evidence. The file itself stays in object storage; only
 * the SHA-256 digest is written on chain (`record_photo_hash`), which is what
 * makes the set impossible to alter after the fact.
 */
export function PhotosTab() {
  const { lease, actions } = useStore();
  const outFilled = lease.photosOut.filter((p) => p.hash).length;

  return (
    <div className="grid gap-8">
      <p className="m-0 max-w-[64ch] text-[13.5px] leading-[1.65] text-neutral-300">
        Odalara göre yükleyin. Dosya obje depolamada kalır, yalnızca SHA-256 özeti zincire yazılır —
        bu yüzden fotoğraf sonradan değiştirilemez. Boş kutulara tıklayarak yükleme yapabilirsiniz.
      </p>

      <div className="card grid gap-6 p-card-lg">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="font-heading text-[17px] font-medium">Giriş kanıtı</div>
          <span className="tag tag-neutral">{inCountText(lease)}</span>
        </div>
        <PhotoGrid
          photos={lease.photosIn}
          emptyLabel="yüklenmedi"
          onUpload={(i) => actions.uploadPhoto("in", i)}
        />
      </div>

      <div className="card grid gap-6 p-card-lg">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="font-heading text-[17px] font-medium">Çıkış kanıtı</div>
          <span className="tag tag-accent">{outCountText(lease)}</span>
        </div>
        <PhotoGrid
          photos={lease.photosOut}
          emptyLabel="yüklemek için tıkla"
          onUpload={(i) => actions.uploadPhoto("out", i)}
        />
        <div className="flex flex-wrap items-center gap-4 border-t border-divider pt-6">
          <button
            type="button"
            className="btn btn-primary"
            onClick={actions.lockExitSet}
            disabled={lease.outLocked || outFilled === 0}
          >
            Seti kilitle ve zincire yaz
          </button>
          <span className="text-[12px] text-neutral-400">
            {lease.outLocked
              ? "Set kilitlendi; fotoğraflar artık değiştirilemez."
              : "Kilitledikten sonra fotoğraf eklenemez veya değiştirilemez."}
          </span>
        </div>
      </div>
    </div>
  );
}

function PhotoGrid({
  photos,
  emptyLabel,
  onUpload,
}: {
  photos: Photo[];
  emptyLabel: string;
  onUpload: (index: number) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(152px,1fr))] gap-4">
      {photos.map((p, i) => (
        <button
          key={p.room}
          type="button"
          onClick={() => onUpload(i)}
          className={`grid aspect-4/3 content-end justify-items-start gap-1 rounded-md border bg-neutral-900 p-3 text-left hover:border-accent-600 ${
            p.hash ? "border-solid border-neutral-800" : "border-dashed border-neutral-700"
          }`}
        >
          <span className="text-[12px]">{p.room}</span>
          <span className="font-mono text-[10.5px] text-neutral-400">
            {p.hash ? "sha256 " + p.hash : emptyLabel}
          </span>
        </button>
      ))}
    </div>
  );
}
