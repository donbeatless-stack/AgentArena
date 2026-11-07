import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  Coffee,
  Cookie,
  Cpu,
  Eye,
  Package,
  ShoppingBag,
  Sprout,
  Truck,
  Users,
} from "lucide-react";
import { money, signedMoney } from "../../api";
import type { DecisionEvent, Merchant, ProductId } from "../../types";
import { AnimatedValue } from "../decisions/AnimatedValue";
import { actionLabel, PRODUCTS } from "./sceneState";
import { locale, st, t } from "../../i18n";

const ICONS = { coffee: Coffee, oats: Sprout, bar: Cookie };
const PHASES = [
  "observe",
  "route",
  "decide",
  "simulate",
  "review",
  "approval",
  "negotiate",
  "commit_plan",
  "settle",
];

export function ShopScene({
  merchant,
  before,
  events,
  round,
  onDetail,
}: {
  merchant: Merchant;
  before: Merchant;
  events: DecisionEvent[];
  round: number;
  onDetail: () => void;
}) {
  const last = events.at(-1);
  const settlement = events.find((event) => event.node === "settle");
  const proposals = events.flatMap((event) =>
    event.payload.plan || event.payload.decision
      ? [event.payload.plan ?? event.payload.decision!]
      : [],
  );
  const plan = proposals.at(-1);
  const candidates = events.filter((event) => event.payload.evaluations).at(-1)
    ?.payload.evaluations;
  const quotes = events.filter(
    (event) =>
      event.node === "negotiate" &&
      ["offer", "accept", "reject"].includes(event.payload.message?.action ?? ""),
  );
  const quote = quotes.at(-1);
  const productQuotes = quote
    ? quotes.filter(
        (event) =>
          event.payload.product_id === quote.payload.product_id &&
          event.payload.message!.action !== "reject" &&
          event.payload.message!.unit_price! > 0,
      )
    : [];
  const prices = productQuotes.map(
    (event) => event.payload.message!.unit_price!,
  );
  const minPrice = Math.min(...prices),
    maxPrice = Math.max(...prices);
  const pricePosition = (value: number) =>
    8 + ((value - minPrice) / Math.max(1, maxPrice - minPrice)) * 84;
  const started =
    last &&
    ["started", "model_started", "tool_started", "waiting"].includes(
      last.status,
    );
  const phase = PHASES.indexOf(last?.node ?? "");
  const metrics = settlement?.payload.metrics;
  const purchased = metrics?.purchased ?? 0;
  const sold = metrics?.sold ?? 0;
  const tools = events.filter(
    (event) => event.status === "tool_completed",
  ).length;
  const tokens = events.reduce(
    (sum, event) =>
      sum +
      (event.payload.input_tokens ?? 0) +
      (event.payload.output_tokens ?? 0),
    0,
  );
  return (
    <article
      className={`theatre-shop store-${merchant.color} ${started ? "shop-working" : ""} ${settlement ? "shop-settled" : ""}`}
      aria-label={t("{name} store", { name: st(merchant.name) })}
    >
      <header className="shop-identity">
        <span className="shop-agent">
          {merchant.mode === "llm" ? <Bot size={20} /> : <Cpu size={20} />}
        </span>
        <div>
          <h3>{st(merchant.name)}</h3>
          <small>
            {merchant.mode === "llm"
              ? merchant.model_config?.model
              : st(merchant.strategy_name)}
          </small>
        </div>
        <button
          className="icon-button"
          onClick={onDetail}
          aria-label={t("View {name} decision details", { name: st(merchant.name) })}
        >
          <Eye size={17} />
        </button>
      </header>
      <div
        className="shop-action"
        role="status"
        key={`${round}-${last?.id ?? 0}`}
      >
        <i className={started ? "action-pulse" : ""} />
        <strong>{merchant.bankrupt ? t("Out of business") : actionLabel(last)}</strong>
        {last?.status === "completed" && <Check size={14} />}
      </div>
      <div
        className="shop-phase-track"
        aria-label={t("Current stage: {stage}", { stage: actionLabel(last) })}
      >
        {PHASES.map((node, index) => (
          <i
            key={node}
            className={
              index === phase
                ? "current"
                : events.some((event) => event.node === node)
                  ? "visited"
                  : ""
            }
          />
        ))}
      </div>
      <div className="shop-building">
        <div className="store-awning">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="store-window">
          {merchant.inventory.map((stock) => {
            const Icon = ICONS[stock.product_id];
            const action = plan?.products.find(
              (item) => item.product_id === stock.product_id,
            );
            const planned = action && !settlement;
            const price = planned ? action.price : stock.price;
            const delivery = settlement && merchant.procurement?.find(
              (item) => item.product_id === stock.product_id,
            );
            const delta =
              stock.quantity -
              before.inventory.find(
                (item) => item.product_id === stock.product_id,
              )!.quantity;
            return (
              <div className="visual-product" key={stock.product_id}>
                <div className="product-caption">
                  <Icon size={15} />
                  <span>{st(stock.name)}</span>
                  <b
                    key={price}
                    title={
                      planned
                        ? t("Planned unit price to customers; takes effect at settlement")
                        : t("Unit price to customers")
                    }
                  >
                    {planned ? t("Planned price") : t("Price")} ¥{money(price)}
                  </b>
                </div>
                <div
                  className="product-shelf"
                  aria-label={t("{product} stock {count} units", {
                    product: st(stock.name),
                    count: stock.quantity,
                  })}
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <span
                      className={
                        i < Math.ceil(stock.quantity / 15) ? "filled" : ""
                      }
                      key={i}
                    >
                      <Icon size={16} />
                    </span>
                  ))}
                </div>
                <div className="stock-caption">
                  <strong>
                    <AnimatedValue
                      value={stock.quantity}
                      format={(value) => t("Stock {count} units", { count: value })}
                    />
                  </strong>
                  {settlement ? (
                    <span className={delta >= 0 ? "positive" : "negative"}>
                      {delta >= 0 ? (
                        <ArrowUp size={11} />
                      ) : (
                        <ArrowDown size={11} />
                      )}
                      {Math.abs(delta)}
                    </span>
                  ) : action ? (
                    <span className="planned-action">
                      {t("Plan to buy {count} units", { count: action.purchase_quantity })}
                    </span>
                  ) : (
                    null
                  )}
                </div>
                {delivery && (
                  <div className="product-delivery" aria-label={t("{product} purchase result", { product: st(stock.name) })}>
                    {delivery.quantity > 0 ? (
                      <>
                        <b>{t("Unit cost ¥{price}", { price: money(delivery.unit_price!) })}</b>
                        <span>
                          {t("Received {got}/{asked} units", {
                            got: delivery.quantity,
                            asked: delivery.requested_quantity,
                          })}
                        </span>
                      </>
                    ) : (
                      <>
                        <b>
                          {delivery.status === "not_ordered"
                            ? t("No purchase planned")
                            : t("Nothing received")}
                        </b>
                        <span>
                          {delivery.status === "rejected"
                            ? t("No deal reached")
                            : delivery.status === "not_ordered"
                              ? ""
                              : t("No supply available")}
                        </span>
                        {delivery.requested_quantity > 0 && (
                          <span>
                            {t("Received {got}/{asked} units", {
                              got: 0,
                              asked: delivery.requested_quantity,
                            })}
                          </span>
                        )}
                        {delivery.status !== "not_ordered" && delivery.unit_price !== null && (
                          <span>{t("Quote ¥{price}", { price: money(delivery.unit_price) })}</span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="store-door">
          <span />
          <i /> <small>{merchant.bankrupt ? "CLOSED" : "OPEN"}</small>
        </div>
        {settlement && (
          <div
            className="shop-trade-motion"
            key={settlement.id}
            aria-hidden="true"
          >
            {purchased > 0 && <Truck className="arriving-truck" size={25} />}
            {sold > 0 && (
              <>
                <span className="customer customer-one">
                  <Users size={21} />
                </span>
                <span className="customer customer-two">
                  <ShoppingBag size={18} />
                </span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="shop-wallet">
        <span>{t("Cash")}</span>
        <strong>
          <AnimatedValue
            value={merchant.cash}
            format={(value) => `¥${money(value)}`}
          />
        </strong>
      </div>
      <div
        className="shop-result"
        key={`${round}-${settlement?.id ?? "pending"}`}
      >
        {metrics ? (
          <>
            <span>
              <Truck size={14} />
              {t("Bought")} <b>{purchased}</b>
            </span>
            <span>
              <ShoppingBag size={14} />
              {t("Sold")} <b>{sold}</b>
            </span>
            <strong className={metrics.profit >= 0 ? "positive" : "negative"}>
              {signedMoney(metrics.profit)}
              <small>{t("Round profit")}</small>
            </strong>
          </>
        ) : (
          <>
            <Package size={16} />
            <span>
              {plan
                ? t("Planning to buy {count} units", {
                    count: plan.products.reduce(
                      (sum, item) => sum + item.purchase_quantity,
                      0,
                    ),
                  })
                : t("Waiting for a plan")}
            </span>
            <small>{t("Not settled yet")}</small>
          </>
        )}
      </div>
      {settlement && metrics ? (
        <div className="shop-profit-breakdown" aria-label={t("This round's profit breakdown")}>
          <span>
            {t("Gross margin")}{" "}
            <b>{signedMoney(metrics.revenue - metrics.cost_of_goods)}</b>
          </span>
          <span>
            {t("Marketing spend")} <b>−¥{money(metrics.marketing)}</b>
          </span>
          <span>
            {t("Rent and holding")} <b>−¥{money(metrics.operating_cost)}</b>
          </span>
        </div>
      ) : quote ? (
        <div className="quote-visual">
          <div className="quote-strip" key={quote.id}>
            <span>
              {t(PRODUCTS[quote.payload.product_id as ProductId])} ·{" "}
              {quote.payload.message!.sender === "supplier"
                ? t("Supplier")
                : t("Buyer")}
            </span>
            {quote.payload.message!.action !== "reject" && (
              <strong>
                {t("Quote ¥{price}", {
                  price: money(quote.payload.message!.unit_price!),
                })}
              </strong>
            )}
            <ArrowRight size={14} />
            <span title={st(quote.payload.message!.reason)}>
              {quote.payload.message!.action === "accept"
                ? t("Price agreed")
                : quote.payload.message!.action === "reject"
                  ? t("Deal declined")
                  : t("Negotiating")}
            </span>
          </div>
          <div className="quote-axis" aria-label={t("Quote history for this product")}>
            {productQuotes.map((event, index) => (
              <i
                key={event.id}
                className={event.payload.message!.sender}
                style={{
                  left: `${pricePosition(event.payload.message!.unit_price!)}%`,
                  opacity: (index + 1) / productQuotes.length,
                }}
                title={`${event.payload.message!.sender === "buyer" ? t("Buyer") : t("Supplier")} ¥${money(event.payload.message!.unit_price!)}`}
              />
            ))}
          </div>
        </div>
      ) : candidates?.length ? (
        <div className="candidate-mini" aria-label={t("Projected profit of candidate plans")}>
          {candidates.map((candidate) => (
            <div key={candidate.index} title={candidate.summary}>
              <span>
                {candidates.length === 1
                  ? t("Expected net profit")
                  : t("Plan {index} · projected", { index: candidate.index + 1 })}
              </span>
              <strong>{signedMoney(candidate.expected_profit)}</strong>
              <i
                style={{
                  width: `${Math.max(8, (Math.abs(candidate.expected_profit) / Math.max(...candidates.map((item) => Math.abs(item.expected_profit)), 1)) * 100)}%`,
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="shop-hint">
          {merchant.mode === "llm"
            ? t("The model runs the store from market information")
            : t("Rule strategy · reproducible baseline")}
        </div>
      )}
      <footer className="shop-telemetry">
        {merchant.mode === "llm" ? <>
          <span>{t("{count} model tool calls", { count: tools })}</span>
          <span>{tokens.toLocaleString(locale())} tokens</span>
        </> : <span>{t("Rule execution · no model calls")}</span>}
        <button onClick={onDetail}>
          {t("Details")} <ChevronRight size={12} />
        </button>
      </footer>
    </article>
  );
}
