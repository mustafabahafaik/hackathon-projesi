/**
 * Seed data for the UI prototype.
 *
 * ⚠ These are design fixtures, not chain reads. Nothing in this file talks to
 * an anchor, to Soroswap or to DeFindex, and nothing here should ever be
 * presented as a settled transaction. They exist so the screens can be built
 * and reviewed before `packages/sdk` can read a deployed escrow contract;
 * `getLeases()` is the single seam to replace with that read.
 *
 * See the repo README, "Entegrasyon sınırı".
 */
import { createRng, shortHash, txId } from "./format";
import type { Lease } from "./types";

export const ROOMS = ["Salon", "Mutfak", "Banyo", "Yatak odası", "Balkon", "Sayaçlar"];

/** Fixed seed: server and client must render the same placeholder digests. */
const rng = createRng(0x5e11a2);

export function getLeases(): Lease[] {
  return [
    {
      id: "LSE-4127",
      address: "Kadıköy, İstanbul · daire 4",
      landlord: "Ayşe Y.",
      tenant: "mert@ogrenci.edu.tr",
      amount: 24000,
      term: "01.10.2026 – 30.09.2027",
      depStep: 4,
      phase: "exit",
      photosIn: ROOMS.map((room) => ({ room, hash: shortHash(rng) })),
      photosOut: ROOMS.map((room, i) => ({ room, hash: i < 3 ? shortHash(rng) : null })),
      outLocked: false,
      items: [
        { label: "Son ay kirası", amount: 12000, evidence: "Banka dökümü", status: "kabul" },
        { label: "Boya ve tamir", amount: 7800, evidence: "Fatura · foto 3, 7", status: "bekliyor" },
        { label: "Parke hasarı", amount: 4200, evidence: "Foto 9 · keşif", status: "itiraz" },
      ],
      settled: false,
      dispute: null,
      events: [
        {
          time: "02.10 09:14",
          title: "Anchor deposit · SEP-24",
          detail: "24.000 TL banka havalesi onaylandı",
          tx: txId(rng),
        },
        {
          time: "02.10 09:16",
          title: "Soroswap swap",
          detail: "TRYX → USDC · 583,90 USDC",
          tx: txId(rng),
        },
        {
          time: "02.10 09:17",
          title: "escrow.deposit → DeFindex",
          detail: "583,90 USDC kasaya yatırıldı",
          tx: txId(rng),
        },
        {
          time: "05.10 18:40",
          title: "record_photo_hash · giriş",
          detail: "6 fotoğraf · merkle root",
          tx: txId(rng),
        },
      ],
    },
    {
      id: "LSE-5002",
      address: "Bornova, İzmir · daire 2",
      landlord: "Ayşe Y.",
      tenant: "elif@ogrenci.edu.tr",
      amount: 15000,
      term: "01.11.2026 – 31.10.2027",
      depStep: 0,
      phase: "deposit",
      photosIn: ROOMS.map((room) => ({ room, hash: null })),
      photosOut: ROOMS.map((room) => ({ room, hash: null })),
      outLocked: false,
      items: [],
      settled: false,
      dispute: null,
      events: [
        {
          time: "28.10 11:02",
          title: "create_lease",
          detail: "Kira kaydı açıldı · 15.000 TL",
          tx: txId(rng),
        },
      ],
    },
  ];
}

/** Runtime placeholders, only ever called from event handlers on the client. */
export const runtimeRng = createRng(0x9184d9);

/** The e-mail the "Demo hesabı gör" button signs in as. */
export const DEMO_EMAIL = "mert@ogrenci.edu.tr";
