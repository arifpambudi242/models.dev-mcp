// Tools: Currency Conversion

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fetchExchangeRates,
  convertCurrency,
  formatCurrencyValue,
} from "../data/currency.js";

export function registerCurrencyTools(server: McpServer): void {
  // 1. Convert Currency
  server.tool(
    "convert_currency",
    "Convert an amount in USD to any world currency (IDR, EUR, JPY, GBP, AUD, CAD, SGD, INR, etc.)",
    {
      amount_usd: z.number().describe("Amount in USD to convert"),
      target_currency: z
        .string()
        .describe("3-letter ISO currency code (e.g. IDR, EUR, JPY, GBP, SGD, AUD, CAD)"),
    },
    async ({ amount_usd, target_currency }) => {
      try {
        const result = await convertCurrency(amount_usd, target_currency);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  amount_usd,
                  target_currency: result.currency,
                  converted_amount: result.amount,
                  formatted: result.formatted,
                  exchange_rate_per_usd: result.rate,
                  is_fallback_rate: result.isFallback,
                  summary: `$${amount_usd} USD = ${result.formatted} (1 USD = ${formatCurrencyValue(result.rate, result.currency)})`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. List Supported Currencies
  server.tool(
    "list_supported_currencies",
    "List all available world currency codes with their current USD exchange rates",
    {
      search: z
        .string()
        .optional()
        .describe("Optional currency code or name filter (e.g. IDR, EUR, Yen, Rupiah)"),
    },
    async ({ search }) => {
      const data = await fetchExchangeRates();
      let entries = Object.entries(data.rates);

      if (search) {
        const q = search.toLowerCase();
        entries = entries.filter(([code]) => code.toLowerCase().includes(q));
      }

      const formattedList = entries.map(([code, rate]) => ({
        code,
        rate_per_usd: rate,
        example_10_usd: formatCurrencyValue(10 * rate, code),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                base: "USD",
                total_currencies: entries.length,
                last_updated: data.lastUpdated,
                is_fallback: !!data.isFallback,
                currencies: formattedList,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
