export const metadata = {
  title: "Privacy Policy | Wokbook",
  description: "Privacy Policy for Wokbook, operated by Kaleva Food and Spices.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</p>

      <div className="mt-8 space-y-6 text-[15px] leading-7">
        <p>
          This Privacy Policy explains how Wokbook (&ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by
          Kaleva Food and Spices, collects, uses, and protects information when you interact with us,
          including through our website, customer support channels, and messaging platforms such as
          WhatsApp, Instagram, and Facebook.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-slate-950">Information We Collect</h2>
          <p className="mt-2">
            We may collect information you provide directly to us, such as your name, phone number,
            email address, delivery address, and order details, when you place an order, contact us,
            or message us on WhatsApp, Instagram, or Facebook. We may also collect information about
            your interactions with our messages, such as delivery and read status.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-950">How We Use Information</h2>
          <p className="mt-2">
            We use the information we collect to process orders, respond to customer inquiries,
            provide customer support, send order updates and notifications, and improve our products
            and services. We do not sell your personal information to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-950">Messaging Platforms</h2>
          <p className="mt-2">
            When you message us on WhatsApp, Instagram, or Facebook, we receive your message content
            and public profile information (such as your name and profile photo, where made available
            by the platform) so that our team can respond to you. We use this information solely to
            communicate with you and provide support.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-950">Data Retention &amp; Security</h2>
          <p className="mt-2">
            We retain your information for as long as necessary to fulfil the purposes described in
            this policy, or as required by law. We take reasonable technical and organisational
            measures to protect your information from unauthorised access, alteration, or disclosure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-950">Your Rights</h2>
          <p className="mt-2">
            You may contact us at any time to ask what information we hold about you, to request a
            correction, or to request deletion of your information, subject to applicable law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-950">Contact Us</h2>
          <p className="mt-2">
            If you have any questions about this Privacy Policy, please contact us through any of our
            official channels, including WhatsApp, Instagram, or Facebook.
          </p>
        </section>
      </div>
    </div>
  );
}
