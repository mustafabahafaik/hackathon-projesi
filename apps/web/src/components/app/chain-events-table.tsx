import type { ChainEvent } from "@/lib/types";

/**
 * The ledger, newest first. Transaction ids link out to the explorer once the
 * indexer is wired up; today they carry the placeholder id the action logged.
 */
export function ChainEventsTable({
  events,
  headers = ["Zaman", "İşlem", "Detay", "Tx"],
}: {
  events: ChainEvent[];
  headers?: [string, string, string, string] | string[];
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {events.map((e, i) => (
          <tr key={e.tx + i}>
            <td className="whitespace-nowrap">{e.time}</td>
            <td>{e.title}</td>
            <td className="text-neutral-300">{e.detail}</td>
            <td>
              <a href="#" className="font-mono text-[13px]">
                {e.tx}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
