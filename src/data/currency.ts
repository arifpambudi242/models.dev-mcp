// Currency exchange rate fetcher with caching and offline fallback

import { Cache } from "./cache.js";

const CURRENCY_CACHE_KEY = "exchange_rates_usd";
// 1 hour cache TTL for currency rates
const CURRENCY_CACHE_TTL = 60 * 60 * 1000;

const cache = new Cache(CURRENCY_CACHE_TTL);

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  lastUpdated: string;
  isFallback?: boolean;
}

// Hardcoded fallback rates relative to USD in case API is unavailable
const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  IDR: 15800.0,
  EUR: 0.92,
  GBP: 0.78,
  JPY: 155.0,
  AUD: 1.52,
  CAD: 1.38,
  SGD: 1.34,
  INR: 84.5,
  CNY: 7.24,
  BRL: 5.75,
  MYR: 4.45,
  THB: 34.5,
  PHP: 58.5,
  VND: 25400.0,
  KRW: 1390.0,
};

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const cached = cache.get<ExchangeRates>(CURRENCY_CACHE_KEY);
  if (cached) {
    return cached;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        result: string;
        time_last_update_utc?: string;
        rates?: Record<string, number>;
      };

      if (data.rates && typeof data.rates === "object") {
        const result: ExchangeRates = {
          base: "USD",
          rates: { ...FALLBACK_RATES, ...data.rates },
          lastUpdated: data.time_last_update_utc ?? new Date().toISOString(),
          isFallback: false,
        };
        cache.set(CURRENCY_CACHE_KEY, result, CURRENCY_CACHE_TTL);
        return result;
      }
    }
  } catch (err) {
    console.error("Failed to fetch exchange rates, using fallback:", err);
  }

  // Fallback
  const fallbackResult: ExchangeRates = {
    base: "USD",
    rates: FALLBACK_RATES,
    lastUpdated: new Date().toISOString(),
    isFallback: true,
  };
  cache.set(CURRENCY_CACHE_KEY, fallbackResult, 5 * 60 * 1000); // 5 min cache for fallback
  return fallbackResult;
}

export async function convertCurrency(
  amountUsd: number,
  targetCurrency: string,
): Promise<{
  amount: number;
  rate: number;
  currency: string;
  formatted: string;
  isFallback: boolean;
}> {
  const code = targetCurrency.toUpperCase();
  const data = await fetchExchangeRates();

  const rate = data.rates[code];
  if (!rate) {
    throw new Error(
      `Unsupported currency code '${code}'. Supported currencies include: ${Object.keys(
        data.rates,
      ).slice(0, 20).join(", ")}...`,
    );
  }

  const convertedAmount = amountUsd * rate;
  const formatted = formatCurrencyValue(convertedAmount, code);

  return {
    amount: convertedAmount,
    rate,
    currency: code,
    formatted,
    isFallback: !!data.isFallback,
  };
}

export function formatCurrencyValue(amount: number, currencyCode: string): string {
  const code = currencyCode.toUpperCase();
  
  // Format based on magnitude and currency
  if (code === "IDR" || code === "VND" || code === "KRW" || code === "JPY") {
    // Currencies usually displayed as integers or up to 2 decimal places for small fractions
    if (amount < 0.01 && amount > 0) {
      return `${code} ${amount.toFixed(4)}`;
    }
    return `${code} ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  if (amount < 0.0001 && amount > 0) {
    return `${code} ${amount.toFixed(6)}`;
  }

  return `${code} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}
