import { Router } from "express"
import stripeCheckout from "./routes/stripe-checkout"

export default (container) => {
  const app = Router()

  stripeCheckout(app)

  return app
}
