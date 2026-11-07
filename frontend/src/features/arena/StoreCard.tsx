import { Bot, TrendingUp, Zap } from "lucide-react";
import { count, money, signedMoney } from "../../api";
import { COLORS, Sparkline } from "../../components/Charts";
import { Avatar } from "../../components/ui";
import type { Arena, Merchant } from "../../types";
import { st, t } from "../../i18n";

export function StoreCard({
  merchant,
  arena,
}: {
  merchant: Merchant;
  arena: Arena;
}) {
  const trend = arena.history
    .filter((point) => point.round <= arena.snapshot.round)
    .map(
      (point) =>
        point.merchants.find((item) => item.id === merchant.id)!.profit,
    );
  return (
    <article className={`store-card store-${merchant.color}`}>
      <div className="store-heading">
        <Avatar name={st(merchant.name)} color={merchant.color} />
        <div>
          <h3>{st(merchant.name)}</h3>
          <span>{st(merchant.strategy_name)}</span>
          {merchant.model_config?.model && (
            <small className="model-tag">{merchant.model_config.model}</small>
          )}
        </div>
        <span className="engine-badge">
          {merchant.bankrupt ? (
            t("Exited")
          ) : merchant.mode === "llm" ? (
            <>
              <Bot size={12} />
              LLM
            </>
          ) : (
            <>
              <Zap size={12} />
              {t("Rule")}
            </>
          )}
        </span>
      </div>
      <div className="store-profit">
        <div>
          <span>{t("Net profit")}</span>
          <strong className={merchant.profit >= 0 ? "positive" : "negative"}>
            {signedMoney(merchant.profit)}
          </strong>
        </div>
        <Sparkline values={trend} color={COLORS[merchant.color]} />
      </div>
      <div className="store-financials">
        <span>
          {t("Cash")}
          <b>¥{money(merchant.cash)}</b>
        </span>
        <span>
          {t("Equity")}
          <b>¥{money(merchant.equity)}</b>
        </span>
        <span>
          {t("Sold this round")}
          <b>
            {merchant.metrics.sold}
            <small> {t("units")}</small>
          </b>
        </span>
      </div>
      <div className="inventory-table">
        <div className="inventory-labels">
          <span>{t("Product")}</span>
          <span>{t("Stock")}</span>
          <span>{t("Price")}</span>
        </div>
        {merchant.inventory.map((stock) => (
          <div key={stock.product_id}>
            <span>
              <i className={`product-dot product-${stock.product_id}`} />
              {st(stock.name)}
            </span>
            <span className={stock.quantity === 0 ? "negative" : ""}>
              {stock.quantity}
              <small> {t("units")}</small>
            </span>
            <b>¥{money(stock.price)}</b>
          </div>
        ))}
      </div>
      <div className="store-footer">
        <span className={merchant.roi >= 0 ? "positive" : "negative"}>
          <TrendingUp size={13} />
          {merchant.roi >= 0 ? "+" : ""}
          {merchant.roi}%
        </span>
        <span>
          {t("{count} sold in total", { count: count(merchant.total_sold) })}
        </span>
      </div>
    </article>
  );
}
