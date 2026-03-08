import { useState, useEffect, useRef } from "react";
import { useGasPrices } from "./useGasPrices";

function formatUsdc(value) {
  if (value === undefined || value === null) return "—";
  if (value < 0.000001) return "$0.000000";
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(4)}`;
}

export default function App() {
  const { data, error, loading, lastUpdate } = useGasPrices();
  const [refreshKey, setRefreshKey] = useState(0);
  const prevDataRef = useRef(null);

  useEffect(() => {
    if (data && prevDataRef.current) {
      setRefreshKey((k) => k + 1);
    }
    prevDataRef.current = data;
  }, [data]);

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="header">
        <div className="header__left">
          <h1 className="header__title">MGO</h1>
          <p className="header__subtitle">
            Multi-chain Gas Optimizer — real-time USDC cost comparison across 9
            EVM chains
          </p>
        </div>
        <div className="header__right">
          <span className="status-dot" />
          <span className="status-label">LIVE</span>
        </div>
      </header>

      {/* Error */}
      {error && <div className="error-banner">{error}</div>}

      {/* Loading skeleton */}
      {loading && !data && <LoadingSkeleton />}

      {data && (
        <>
          {/* Recommendation */}
          <div className="recommendation">
            <div className="recommendation__content">
              <span className="recommendation__label">RECOMMENDED</span>
              <span className="recommendation__chain">{data.cheapest}</span>
              <span className="recommendation__desc">
                lowest cost for DEX swap right now
              </span>
            </div>
            <div className="recommendation__savings">
              <span className="recommendation__savings-value">
                {data.savingsPercent}%
              </span>
              <span className="recommendation__savings-label">
                cheaper than {data.vsChain}
              </span>
            </div>
          </div>

          {/* Basic Tier */}
          <div className="tier-section">
            <div className="tier-header">
              <span className="tier-label tier-label--basic">BASIC</span>
              <span className="tier-desc">4 chains — $0.001 / call</span>
            </div>
            <div className="chain-grid">
              {data.chains
                .filter((c) => c.tier === "basic")
                .map((chain, index) => (
                  <ChainCard
                    key={chain.chain}
                    chain={chain}
                    index={index}
                    data={data}
                  />
                ))}
            </div>
          </div>

          {/* Premium Tier */}
          <div className="tier-section">
            <div className="tier-header">
              <span className="tier-label tier-label--premium">PREMIUM</span>
              <span className="tier-desc">+5 chains — $0.002 / call</span>
            </div>
            <div className="chain-grid">
              {data.chains
                .filter((c) => c.tier === "premium")
                .map((chain, index) => (
                  <ChainCard
                    key={chain.chain}
                    chain={chain}
                    index={index + 4}
                    data={data}
                  />
                ))}
            </div>
          </div>

          {/* Pricing Table */}
          <div className="pricing-section">
            <h2 className="pricing-section__title">Choose Your Plan</h2>
            <p className="pricing-section__subtitle">
              Pay per API call with USDC on Base. No subscriptions.
            </p>
            <div className="pricing-table-wrapper">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th className="pricing-table__feature-header">Feature</th>
                    <th className="pricing-table__tier-header pricing-table__tier-header--demo">
                      <span className="pricing-table__tier-name">Demo</span>
                      <span className="pricing-table__tier-price">Free</span>
                    </th>
                    <th className="pricing-table__tier-header pricing-table__tier-header--basic">
                      <span className="pricing-table__tier-name">Basic</span>
                      <span className="pricing-table__tier-price">$0.001</span>
                    </th>
                    <th className="pricing-table__tier-header pricing-table__tier-header--premium">
                      <span className="pricing-table__tier-name">Premium</span>
                      <span className="pricing-table__tier-price">$0.002</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pricing-table__feature">Chains</td>
                    <td className="pricing-table__cell">4</td>
                    <td className="pricing-table__cell">4</td>
                    <td className="pricing-table__cell">9</td>
                  </tr>
                  <tr>
                    <td className="pricing-table__feature">Gas Prices</td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                  </tr>
                  <tr>
                    <td className="pricing-table__feature">Estimated Costs (USDC)</td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                  </tr>
                  <tr>
                    <td className="pricing-table__feature">Cheapest Chain Recommendation</td>
                    <td className="pricing-table__cell"><span className="pricing-cross">&#10005;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                  </tr>
                  <tr>
                    <td className="pricing-table__feature">Savings % Calculation</td>
                    <td className="pricing-table__cell"><span className="pricing-cross">&#10005;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                  </tr>
                  <tr>
                    <td className="pricing-table__feature">Cost Savings Amount</td>
                    <td className="pricing-table__cell"><span className="pricing-cross">&#10005;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                  </tr>
                  <tr>
                    <td className="pricing-table__feature">BNB, Polygon, Avalanche, zkSync, Hyperliquid</td>
                    <td className="pricing-table__cell"><span className="pricing-cross">&#10005;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-cross">&#10005;</span></td>
                    <td className="pricing-table__cell"><span className="pricing-check">&#10003;</span></td>
                  </tr>
                  <tr>
                    <td className="pricing-table__feature">Rate Limit</td>
                    <td className="pricing-table__cell">10/hr</td>
                    <td className="pricing-table__cell">Unlimited</td>
                    <td className="pricing-table__cell">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="pricing-table__feature">Payment</td>
                    <td className="pricing-table__cell">Free</td>
                    <td className="pricing-table__cell">USDC on Base</td>
                    <td className="pricing-table__cell">USDC on Base</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Status Bar */}
          <div className="status-bar">
            <span className="status-bar__time">
              Updated {lastUpdate?.toLocaleTimeString()}
            </span>
            <span className="status-bar__refresh" key={refreshKey} />
          </div>
        </>
      )}
    </div>
  );
}

function ChainCard({ chain, index, data }) {
  if (chain.status === "error") {
    return (
      <div
        className="chain-card chain-card--error"
        style={{ "--accent": chain.color, "--delay": index }}
      >
        <div className="chain-card__header">
          <span className="chain-card__dot" />
          <span className="chain-card__name">{chain.chain}</span>
          <span className="chain-card__chain-id">#{chain.chainId}</span>
        </div>
        <div className="chain-card__hero">
          <span className="chain-card__total-label">STATUS</span>
          <span className="chain-card__error-msg">RPC Error</span>
          <span className="chain-card__error-detail">{chain.error}</span>
        </div>
      </div>
    );
  }

  const isCheapest = chain.chain === data.cheapest;
  const cheapestUsdc =
    data.chains.find((c) => c.chain === data.cheapest)?.costs?.dexSwap?.usdc || 0;
  const thisUsdc = chain.costs.dexSwap.usdc;
  const extraPercent =
    !isCheapest && cheapestUsdc > 0
      ? (((thisUsdc - cheapestUsdc) / cheapestUsdc) * 100).toFixed(1)
      : null;

  return (
    <div
      className={`chain-card${isCheapest ? " chain-card--cheapest" : ""}`}
      style={{ "--accent": chain.color, "--delay": index }}
    >
      <div className="chain-card__header">
        <span className="chain-card__dot" />
        <span className="chain-card__name">{chain.chain}</span>
        <span className="chain-card__chain-id">#{chain.chainId}</span>
        {isCheapest && <span className="chain-card__badge">CHEAPEST</span>}
      </div>

      {/* Hero: DEX Swap USDC cost */}
      <div className="chain-card__hero">
        <span className="chain-card__total-label">DEX Swap Cost</span>
        <div className="chain-card__total-row">
          <span className="chain-card__total">
            {formatUsdc(chain.costs.dexSwap.usdc)}
          </span>
          <span className="chain-card__total-unit">USDC</span>
        </div>
        {extraPercent && (
          <span className="chain-card__extra-cost">
            +{extraPercent}% vs {data.cheapest}
          </span>
        )}
      </div>

      <div className="divider" />

      {/* Gas Price */}
      <div className="chain-card__fees">
        <div className="data-row">
          <span className="data-row__label">Gas Price</span>
          <span className="data-row__value">
            {chain.totalFeeGwei} gwei
          </span>
        </div>
        <div className="data-row">
          <span className="data-row__label">Native Token</span>
          <span className="data-row__value">
            {chain.nativeToken} (${chain.tokenPriceUsd?.toFixed(2)})
          </span>
        </div>
      </div>

      <div className="divider" />

      {/* USDC Costs */}
      <div className="chain-card__costs">
        <div className="data-row">
          <span className="data-row__label">Transfer</span>
          <span className="data-row__value">
            {formatUsdc(chain.costs.nativeTransfer.usdc)} USDC
          </span>
        </div>
        <div className="data-row">
          <span className="data-row__label">ERC-20</span>
          <span className="data-row__value">
            {formatUsdc(chain.costs.erc20Transfer.usdc)} USDC
          </span>
        </div>
        <div className="data-row">
          <span className="data-row__label">DEX Swap</span>
          <span className="data-row__value">
            {formatUsdc(chain.costs.dexSwap.usdc)} USDC
          </span>
        </div>
      </div>

      <div className="divider" />

      <div className="chain-card__meta">
        <span>Block {chain.blockNumber}</span>
        <span>{chain.latencyMs}ms</span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <div className="tier-section">
        <div className="tier-header">
          <span className="tier-label tier-label--basic">BASIC</span>
          <span className="tier-desc">4 chains</span>
        </div>
        <div className="chain-grid">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="chain-card chain-card--loading"
              style={{ "--delay": i }}
            >
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--hero" />
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
            </div>
          ))}
        </div>
      </div>
      <div className="tier-section">
        <div className="tier-header">
          <span className="tier-label tier-label--premium">PREMIUM</span>
          <span className="tier-desc">+5 chains</span>
        </div>
        <div className="chain-grid">
          {[4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="chain-card chain-card--loading"
              style={{ "--delay": i }}
            >
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--hero" />
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
