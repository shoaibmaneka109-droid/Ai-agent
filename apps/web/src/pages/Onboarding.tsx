import type { UserType } from "@securepay/shared";

type Plan = {
  kind: UserType;
  title: string;
  description: string;
  benefits: string[];
};

const plans: Plan[] = [
  {
    kind: "solo",
    title: "Solo",
    description: "For individual operators managing their own payment provider keys.",
    benefits: ["Single-owner tenant", "Personal Stripe or Airwallex credentials", "Lean payment operations"],
  },
  {
    kind: "agency",
    title: "Agency",
    description: "For companies that manage payments across teams and clients.",
    benefits: ["Company tenant", "Role-based memberships", "Provider keys isolated per organization"],
  },
];

export function Onboarding() {
  return (
    <section className="onboarding">
      <div className="eyebrow">SecurePay onboarding</div>
      <h1>Choose how your organization will use SecurePay.</h1>
      <p className="lede">
        Every account is created inside a tenant boundary. Solo users get an individual organization, while Agency users
        get a company workspace for multiple members.
      </p>

      <div className="plan-grid">
        {plans.map((plan) => (
          <article className="plan-card" key={plan.kind}>
            <h2>{plan.title}</h2>
            <p>{plan.description}</p>
            <ul>
              {plan.benefits.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
            <button type="button">Start as {plan.title}</button>
          </article>
        ))}
      </div>
    </section>
  );
}
