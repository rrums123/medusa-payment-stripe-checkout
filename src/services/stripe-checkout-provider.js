import Stripe from "stripe"
import {
    PaymentSessionStatus,
    PaymentSessionData,
} from "@medusajs/medusa"
import {PaymentService} from "medusa-interfaces";

class StripeCheckoutProviderService extends PaymentService {
    static identifier = "stripe-checkout"

    constructor({regionService, manager}, options) {
        super()

        /**
         * Required Stripe options:
         *  {
         *    api_key: "stripe_secret_key", REQUIRED
         *    site_url: "site_url", REQUIRED
         *    // Use this flag to capture payment immediately (default is false)
         *    capture: true
         *  }
         */
        this.options_ = options

        /** @private @const {Stripe} */
        this.stripe_ = Stripe(options.api_key)

        /** @private @const {RegionService} */
        this.regionService_ = regionService

        /** @private @const {EntityManager} */
        this.manager_ = manager
    }

    /**
     * Get payment session status
     * statuses.
     * @param {PaymentSessionData} paymentData - the data stored with the payment session
     * @return {Promise<PaymentSessionStatus>} the status of the order
     */
    async getStatus(paymentData) {
        const {data} = paymentData
        const session = await this.stripe_.checkout.sessions.retrieve(data.id)
        switch (session.payment_status) {
            case "paid":
                return PaymentSessionStatus.AUTHORIZED
            default:
                return PaymentSessionStatus.PENDING
        }
    }

    /**
     * Creates a Stripe payment intent.
     * If customer is not registered in Stripe, we do so.
     * @param {Cart} cart - cart to create a payment for
     * @return {Promise<PaymentSessionData>} Stripe payment intent
     */
    async createPayment(cart) {
        const {email, region_id, items} = cart
        const {currency_code} = await this.regionService_.withTransaction(this.manager_).retrieve(region_id)

        const lineItems = [];
        for (let item of items) {
            let product = await this.createProduct(item.variant)

            let price = await this.stripe_.prices.create({
                unit_amount: Math.round(item.unit_price),
                currency: currency_code,
                product: product.id
            });

            lineItems.push({price: price.id, quantity: item.quantity})
        }

        return await this.stripe_.checkout.sessions.create({
            line_items: lineItems,
            customer_email: email,
            mode: "payment",
            success_url: `${this.options_.site_url}stripe-checkout?action=success&ref=${cart.id}`,
            cancel_url: `${this.options_.site_url}stripe-checkout?action=cancel&ref=${cart.id}`,
        })
    }

    /**
     * Retrieves Stripe payment intent.
     * @param {PaymentData} paymentData - the data of the payment to retrieve
     * @return {Promise<Data>} Stripe payment intent
     */
    async retrievePayment(data) {
        try {
            return this.stripe_.checkout.sessions.retrieve(data.id)
        } catch (error) {
            throw error
        }
    }

    async getPaymentData(sessionData) {
        try {
            return sessionData
        } catch (error) {
            throw error
        }
    }

    async authorizePayment(sessionData, context = {}) {
        const stat = await this.getStatus(sessionData)

        try {
            return {data: sessionData.data, status: stat}
        } catch (error) {
            throw error
        }
    }

    async updatePaymentData(sessionData, cart) {
        try {
            return await this.createPayment(cart)
        } catch (error) {
            throw error
        }
    }

    async deletePayment(payment) {
        try {
            return await this.cancelPayment(payment)
        } catch (error) {
            throw error
        }
    }

    /**
     * Captures payment for Stripe payment intent.
     * @param {Payment} payment - payment method data from cart
     * @return {Promise<PaymentData>} Stripe payment intent
     */
    async capturePayment(payment) {
        const {id} = payment.data.data
        return await this.stripe_.checkout.sessions.retrieve(id).catch(() => undefined)
    }

    /**
     * Cancels payment for Stripe payment intent.
     * @param {Payment} payment - payment method data from cart
     * @return {Promise<PaymentData>} canceled payment intent
     */
    async cancelPayment(payment) {
        const {id} = payment.data
        try {
            return await this.stripe_.checkout.sessions.expire(id)
        } catch (error) {
            if (error.payment_intent.status === "canceled") {
                return error.payment_intent
            }

            throw error
        }
    }

    async createProduct(product_variant) {
        const product = await this.stripe_.products.create({
            name: product_variant.title,
        })

        return product
    }
}

export default StripeCheckoutProviderService
