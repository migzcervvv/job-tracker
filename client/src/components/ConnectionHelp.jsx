import { api } from "../api/client.js";

export function ConnectionHelp() {
  return (
    <details className="connection-help">
      <summary>Connection details</summary>
      <p>
        Application server:{" "}
        <code>{api.defaults?.baseURL || window.location.origin}/api</code>
      </p>
      <p>
        For local use, run the backend in Visual Studio. The HTTPS profile uses
        port 7179; IIS Express uses port 44393. The address in client/.env.local
        must match the selected profile. Restart the frontend after changing it.
      </p>
      <p>
        On Netlify, /api is forwarded to MonsterASP. Publish the updated
        frontend routing file along with the application.
      </p>
    </details>
  );
}
