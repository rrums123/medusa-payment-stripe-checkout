import { Router } from "express"

const route = Router()

export default (app) => {
  app.get("/stripe-checkout", async (req, res) => {
    const action = req.query.action
    const cartId = req.query.ref
    const orderService = req.scope.resolve("orderService")
    const stripeCheckout = req.scope.resolve("pp_stripe-checkout")
    const manager = req.scope.resolve("manager")

    switch (action) {
      case "success":
        const idempotencyKeyService = req.scope.resolve("idempotencyKeyService")
        const headerKey = req.get("Idempotency-Key") || ""

        let idempotencyKey
        try {
          idempotencyKey = await manager.transaction(async (transactionManager) => {
            return await idempotencyKeyService.withTransaction(transactionManager).initializeRequest(
                headerKey,
                req.method,
                req.params,
                req.path
            )
          })
        } catch (error) {
          console.log(error)
          res.status(409).send("Failed to create idempotency key")
          return
        }

        res.setHeader("Access-Control-Expose-Headers", "Idempotency-Key")
        res.setHeader("Idempotency-Key", idempotencyKey.idempotency_key)

        const completionStrat = req.scope.resolve("cartCompletionStrategy")

        const { response_body, response_code } = await completionStrat.complete(
            cartId,
            idempotencyKey,
            req.request_context
        )

        if (response_code === 200) {
          await orderService.capturePayment(response_body.data.id)
          if (stripeCheckout.getThankYouUrl() !== "") {
            return res.redirect(stripeCheckout.getThankYouUrl())
          }
        }

        break

      case "cancel":
        res.status(200).send("Payment cancelled")
        break

      default:
        res.sendStatus(204)
        return

    }

    res.sendStatus(200)
  })
  return app
}
