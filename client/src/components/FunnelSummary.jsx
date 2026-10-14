import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { statusMeta } from "../api/statusMeta.js";
export function FunnelSummary({ revision }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    void api
      .get("/api/analytics/funnel")
      .then((response) => {
        if (!cancelled) setData(response.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [revision]);
  return (
    data && (
      <details className="panel">
        <summary>Your progress at a glance</summary>
        <p>
          {data.total} applications tracked · {data.responded} with an employer
          response recorded
        </p>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Applications</th>
              <th>Average days in this stage</th>
            </tr>
          </thead>
          <tbody>
            {data.stages.map((stage) => (
              <tr key={stage.status}>
                <td>{statusMeta(stage.status).label}</td>
                <td>{stage.count}</td>
                <td>
                  {Math.max(0, stage.averageDaysInCurrentStage).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    )
  );
}
