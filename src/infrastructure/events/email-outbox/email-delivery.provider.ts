export const EMAIL_DELIVERY_PROVIDER = Symbol(
  'EMAIL_DELIVERY_PROVIDER',
);

export interface EmailDeliveryMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailDeliveryProvider {
  send(message: EmailDeliveryMessage): Promise<void>;
}