import { IsUUID } from 'class-validator'

export class InitPaymentDto {
  /** The order to pay for (from POST /orders). */
  @IsUUID()
  orderId!: string
}
