// Loads Razorpay's Checkout script on demand (never bundled — only needed
// on the one Billing screen) and opens it, resolving with the payment
// details on success or rejecting on dismiss/failure. Standard integration
// pattern for Razorpay's own hosted Checkout widget.
let scriptPromise = null;

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export async function openRazorpayCheckout({ keyId, razorpayOrderId, amountPaise, currency, name, description, prefill }) {
  await loadRazorpayScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: keyId,
      order_id: razorpayOrderId,
      amount: amountPaise,
      currency: currency || "INR",
      name: name || "Booster",
      description,
      prefill,
      theme: { color: "#4338ca" },
      handler: (response) => resolve({
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      }),
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.on("payment.failed", (resp) => reject(new Error(resp.error?.description || "Payment failed")));
    rzp.open();
  });
}
