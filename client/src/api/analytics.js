import { api } from './client.js';

// -> { appliedThisWeek, stale: [...], noReply: [...] }
export async function getPipelineAlerts({ staleDays = 7, noReplyDays = 60 } = {}) {
  const { data } = await api.get('/api/analytics/pipeline-alerts', {
    params: { staleDays, noReplyDays },
  });
  return data;
}
