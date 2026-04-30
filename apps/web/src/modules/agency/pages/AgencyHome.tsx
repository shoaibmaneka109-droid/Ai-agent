import { userTypeLabel } from "../../../shared/lib/userType";

export function AgencyHome() {
  return (
    <div>
      <h1>Agency workspace</h1>
      <p>{userTypeLabel("agency")} — multi-user organizations and tenant isolation.</p>
    </div>
  );
}
