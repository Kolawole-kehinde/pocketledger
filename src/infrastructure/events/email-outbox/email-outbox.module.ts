import { Module } from "@nestjs/common";
import { EmailOutboxRepository } from "./email-outbox.repository.js";
import { EmailPayloadEncryptionService } from "./email-payload-encryption.service.js";
import { SmtpEmailDeliveryProvider } from "./smtp-email-delivery.provider.js";
import { EMAIL_DELIVERY_PROVIDER } from "./email-delivery.provider.js";
import { EmailTemplateRenderer } from "./email-template.renderer.js";


@Module({
    providers: [
        EmailOutboxRepository,
        EmailPayloadEncryptionService,
         SmtpEmailDeliveryProvider,
         EmailTemplateRenderer,
    {
      provide: EMAIL_DELIVERY_PROVIDER,
      useExisting: SmtpEmailDeliveryProvider,
    },
    ],
    

    exports:[
        EmailOutboxRepository,
        EmailPayloadEncryptionService 
    ]

})

export class EmailBoxModule {}