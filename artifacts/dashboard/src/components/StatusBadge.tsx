import { cn } from "@/lib/utils";

type OrderStatus =
  | "pending"
  | "confirmed"
  | "paid"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

const statusConfig: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  paid: {
    label: "Paid",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  preparing: {
    label: "Preparing",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
  ready: {
    label: "Ready",
    className: "bg-teal-100 text-teal-800 border-teal-200",
  },
  delivered: {
    label: "Delivered",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as OrderStatus] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <span
      data-testid={`badge-status-${status}`}
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

type PaymentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

const paymentStatusConfig: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  completed: {
    label: "Paid",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  timeout: {
    label: "Timeout",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
};

export function PaymentBadge({ status }: { status: string }) {
  const config = paymentStatusConfig[status as PaymentStatus] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <span
      data-testid={`badge-payment-${status}`}
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
