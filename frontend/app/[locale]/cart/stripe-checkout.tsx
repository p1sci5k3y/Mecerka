import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
    Elements,
    PaymentElement,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Reusable function to load stripe dynamically based on the connected account ID
let stripePromise: Promise<any> | null = null;
const getStripe = (accountId: string) => {
    if (!stripePromise) {
        stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
            stripeAccount: accountId, // Required for Direct Charges!
        });
    }
    return stripePromise;
};

function CheckoutForm({
    onSuccess,
    totalToPay,
}: {
    onSuccess: () => void;
    totalToPay: number;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setIsProcessing(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: 'if_required', // Avoid full redirect if possible to handle logic gracefully
        });

        if (error) {
            toast.error(error.message || 'Se produjo un error al procesar el pago.');
            setIsProcessing(false);
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            toast.success('¡Pago validado con éxito!');
            onSuccess();
        } else {
            setIsProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full">
            <PaymentElement />
            <Button
                type="submit"
                disabled={isProcessing || !stripe || !elements}
                size="lg"
                className="w-full text-base font-bold h-14 rounded-xl"
            >
                {isProcessing ? (
                    <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Procesando...
                    </>
                ) : (
                    `Pagar ${totalToPay.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`
                )}
            </Button>
        </form>
    );
}

export function StripeCheckoutWrapper({
    clientSecret,
    stripeAccountId,
    totalAmount,
    onPaymentSuccess,
}: {
    clientSecret: string;
    stripeAccountId: string;
    totalAmount: number;
    onPaymentSuccess: () => void;
}) {
    return (
        <Elements
            stripe={getStripe(stripeAccountId)}
            options={{
                clientSecret,
                appearance: {
                    theme: 'stripe',
                    variables: {
                        colorPrimary: '#f97316', // tailwind orange-500
                        colorBackground: '#ffffff',
                        colorText: '#30313d',
                        colorDanger: '#df1b41',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        spacingUnit: '4px',
                        borderRadius: '12px',
                    },
                },
            }}
        >
            <CheckoutForm onSuccess={onPaymentSuccess} totalToPay={totalAmount} />
        </Elements>
    );
}
