import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { money, signedMoney, useResource } from "../../api";
import { Button, Empty, ErrorState, Loading } from "../../components/ui";
import type { LedgerEntry, Merchant } from "../../types";
import { st, t } from "../../i18n";

const PRODUCT_NAMES: Record<string, string> = {
  coffee: "Cold brew coffee",
  oats: "Oat breakfast",
  bar: "Energy bar",
};

export function LedgerPanel({
  arenaId,
  round,
  merchants,
}: {
  arenaId: number;
  round: number | null;
  merchants: Merchant[];
}) {
  const [merchant, setMerchant] = useState("");
  const [page, setPage] = useState(0);
  const query = new URLSearchParams();
  if (round !== null) query.set("round", String(round));
  if (merchant) query.set("merchant", merchant);
  const { data, error, reload } = useResource<LedgerEntry[]>(
    `/arenas/${arenaId}/ledger?${query.toString()}`,
  );
  useEffect(() => setPage(0), [round, merchant]);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  const labels = {
    purchase: "Purchase",
    sale: "Sale",
    marketing: "Marketing",
    operations: "Operating cost",
  };
  return (
    <div className="ledger-panel">
      <div className="ledger-toolbar">
        <span>{t("{count} transactions", { count: data.length })}</span>
        <select
          aria-label={t("Filter ledger by store")}
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
        >
          <option value="">{t("All stores")}</option>
          {merchants.map((item) => (
            <option key={item.id} value={item.id}>
              {st(item.name)}
            </option>
          ))}
        </select>
        <a
          href={`/api/arenas/${arenaId}/export?format=csv`}
          download
          className="text-button"
        >
          <Download size={15} />
          {t("Export CSV")}
        </a>
      </div>
      {data.length === 0 ? (
        <Empty title={t("No transactions yet")} />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Round")}</th>
                <th>{t("Store")}</th>
                <th>{t("Type")}</th>
                <th>{t("Product / qty")}</th>
                <th className="text-right">{t("Amount")}</th>
                <th className="text-right">{t("Cash balance")}</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(page * 30, (page + 1) * 30).map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="round-tag">
                      R{String(item.round_number).padStart(2, "0")}
                    </span>
                  </td>
                  <td>{st(item.merchant_name)}</td>
                  <td>
                    <span
                      className={`transaction-type transaction-${item.kind}`}
                    >
                      {t(labels[item.kind])}
                    </span>
                  </td>
                  <td>
                    {item.product_id
                      ? `${t(PRODUCT_NAMES[item.product_id])} × ${item.quantity}`
                      : "—"}
                  </td>
                  <td
                    className={`text-right numeric ${item.amount >= 0 ? "positive" : ""}`}
                  >
                    {signedMoney(item.amount)}
                  </td>
                  <td className="text-right numeric">¥{money(item.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.length > 30 && (
        <div className="pagination">
          <span>
            {page * 30 + 1}–{Math.min((page + 1) * 30, data.length)} /{" "}
            {data.length}
          </span>
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            {t("Previous")}
          </Button>
          <Button
            variant="secondary"
            disabled={(page + 1) * 30 >= data.length}
            onClick={() => setPage(page + 1)}
          >
            {t("Next")}
          </Button>
        </div>
      )}
    </div>
  );
}
