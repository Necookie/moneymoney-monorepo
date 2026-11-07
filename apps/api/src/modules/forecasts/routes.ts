import {
  addDays,
  assessAffordability,
  balanceHistory,
  buildForecast,
  compareScenarios,
  type Scenario,
} from '@mm/finance-engine';
import {
  affordabilityRequest,
  affordabilityResponse,
  forecastQuery,
  forecastResponse,
  scenarioRequest,
  scenarioResponse,
} from '@mm/validation';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { loadSnapshot } from '../../lib/snapshot.js';

const tags = ['forecasts'];

export const forecastsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/forecast',
    {
      schema: {
        tags,
        summary: 'Actual balance history plus a daily projection',
        description:
          'History is computed from recorded transactions only. The projection starts from the actual balance today and adds scheduled inflows/outflows and remaining budgets for the chosen mode.',
        querystring: forecastQuery,
        response: { 200: forecastResponse },
      },
    },
    async (request) => {
      const { horizonDays, mode, historyDays, includeBudgetedSpending } = request.query;
      const snap = await loadSnapshot(app.db, request.auth.userId);
      const history =
        historyDays > 0
          ? balanceHistory(
              snap.engineAccounts,
              snap.engineTxs,
              addDays(snap.today, -historyDays),
              snap.today,
            )
          : [];
      const forecast = buildForecast(
        snap.forecastInput(horizonDays, mode, includeBudgetedSpending),
      );
      return { history, forecast };
    },
  );

  app.post(
    '/forecast/scenarios',
    {
      schema: {
        tags,
        summary: 'Compare what-if scenarios against the baseline',
        body: scenarioRequest,
        response: { 200: scenarioResponse },
      },
    },
    async (request) => {
      const snap = await loadSnapshot(app.db, request.auth.userId);
      const comparisons = compareScenarios(
        snap.forecastInput(request.body.horizonDays, request.body.mode),
        request.body.scenarios as Scenario[],
      );
      return { comparisons };
    },
  );

  app.post(
    '/forecast/affordability',
    {
      schema: {
        tags,
        summary: 'Can I afford this? Simulate a purchase without saving anything',
        body: affordabilityRequest,
        response: { 200: affordabilityResponse },
      },
    },
    async (request) => {
      const snap = await loadSnapshot(app.db, request.auth.userId);
      const { horizonDays, ...purchase } = request.body;
      const paymentAccountBalance = purchase.accountId
        ? (snap.balances.get(purchase.accountId) ?? 0)
        : snap.position.liquid;
      return assessAffordability({
        forecast: snap.forecastInput(horizonDays),
        purchase,
        paymentAccountBalance,
        emergencyFundReserved: snap.emergencyFundReserved,
      });
    },
  );
};
