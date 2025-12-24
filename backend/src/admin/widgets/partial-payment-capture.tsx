import { defineWidgetConfig } from "@medusajs/admin-sdk"; // ✅ CORRECTO
import { useState, useEffect } from "react";

type Payment = {
  id: string;
  amount: number;
  currency_code: string;
  captured_at?: string | null;
  payment_session?: {
    id: string;
    provider_id: string;
    data?: Record<string, unknown>;
  };
};

type Order = {
  id: string;
  payments?: Payment[];
};

type PartialPaymentCaptureProps = {
  order?: Order;
  [key: string]: any;
};

const PartialPaymentCapture = (props: PartialPaymentCaptureProps) => {
  const { order } = props;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mercadopagoPayment = order?.payments?.find((payment) => {
    return (
      payment.payment_session?.provider_id?.includes("mercadopago") &&
      !payment.captured_at
    );
  });

  useEffect(() => {
    if (mercadopagoPayment && !amount) {
      setAmount(mercadopagoPayment.amount.toString());
    }
  }, [mercadopagoPayment, amount]);

  if (!mercadopagoPayment || !order) {
    return null;
  }

  const maxAmount = mercadopagoPayment.amount;
  const currencyCode = mercadopagoPayment.currency_code;

  const handleCapture = async () => {
    setError(null);
    setSuccess(false);

    const captureAmount = Number(amount);

    if (!captureAmount || captureAmount <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }

    if (captureAmount > maxAmount) {
      setError(`El monto no puede exceder ${currencyCode} ${maxAmount}`);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/admin/payments/${mercadopagoPayment.id}/capture`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: captureAmount,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al capturar el pago");
      }

      setSuccess(true);
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err: any) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setError(null);
    setSuccess(false);
    setAmount(maxAmount.toString());
  };

  return (
    <div style={{ marginBottom: "16px" }}>
      <button
        onClick={() => setIsModalOpen(true)}
        style={{
          padding: "8px 16px",
          backgroundColor: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "500",
        }}
      >
        Captura Manual / Parcial
      </button>

      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "24px",
              borderRadius: "8px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: "16px" }}>
              Captura Parcial de Pago
            </h2>

            {error && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: "4px",
                  marginBottom: "16px",
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#d1fae5",
                  color: "#065f46",
                  borderRadius: "4px",
                  marginBottom: "16px",
                }}
              >
                ¡Pago capturado exitosamente! Recargando...
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Monto a Capturar ({currencyCode})
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                max={maxAmount}
                step="0.01"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "16px",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ marginTop: "4px", fontSize: "12px", color: "#6b7280" }}>
                Monto máximo: {currencyCode} {maxAmount}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={handleCloseModal}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCapture}
                disabled={loading || success}
                style={{
                  padding: "8px 16px",
                  backgroundColor: loading || success ? "#9ca3af" : "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loading || success ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Capturando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.before",
});

export default PartialPaymentCapture;

