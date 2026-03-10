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
import { useTranslations, useLocale } from 'next-intl';

// Reusable function to load stripe dynamically based on the connected account ID
const stripePromises: Record<string, Promise<any>> = {};
const getStripe = (accountId: string) => {
    if (!stripePromises[accountId]) {
        stripePromises[accountId] = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
            stripeAccount: accountId, // Required for Direct Charges!
        });
    }
    return stripePromises[accountId];
};

function CheckoutForm({
    onSuccess,
    totalToPay,
    currency = 'EUR'
}: {
    onSuccess: () => void;
    totalToPay: number;
    currency?: string;
}) {
    const locale = useLocale();
    const t = useTranslations('Cart');
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
            toast.error(error.message || t('paymentError'));
            setIsProcessing(false);
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            toast.success(t('paymentSuccess'));
            onSuccess();
        } else if (paymentIntent && paymentIntent.status === 'requires_action') {
            toast.info(t('requiresAction'));
            // keep processing true while waiting for auth, fallback clear
            setTimeout(() => setIsProcessing(false), 5000);
        } else if (paymentIntent && paymentIntent.status === 'processing') {
            toast.info(t('processingPayment'));
            // keep processing true, fallback clear
            setTimeout(() => setIsProcessing(false), 5000);
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
                        {t('processing')}
                    </>
                ) : (
                    `${t('pay')} ${new Intl.NumberFormat(locale, { style: 'currency', currency }).format(totalToPay)}`
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
