import { BadRequestException, ConflictException, InternalServerErrorException } from "@nestjs/common"

export class InvalidBalanceMovementException extends BadRequestException{
   constructor(message: string){
       super({
         code: 'INVALID_BALANCE_MOVEMENT',
         message
       })
   }
}

export class InsufficientAvailableBalanceException extends ConflictException{
     constructor(ledgerAccountId: string){
        super({
             code: 'INSUFFICIENT_AVAILABLE_BALANCE',
             message: 'Insufficient available balance',
             ledgerAccountId
        })
     }
}

export class BalanceProjectionMissingException  extends InternalServerErrorException{
     constructor(ledgerAccountId: string){
        super({
            code:'BALANCE_PROJECTION_MISSING',
            message: 'Balance projectiom is missing.',
            ledgerAccountId
        })
     }
}


export class BalanceAccountContextMissingException extends InternalServerErrorException{
     constructor(ledgerAccountId: string){
        super({
            code: 'BALANCE_ACCOUNT_CONTEXT_MISSING',
            mesage: 'Authoritative account context is missing.',
            ledgerAccountId
        })
     }
}

export class InvalidBalanceAccountConfigurationException  extends InternalServerErrorException{
     constructor(ledgerAccountId: string){
        super({
             code: 'INVALID_BALANCE_ACCOUNT_CONFIGURATION',
             message: 'Ledger account configuration is invalid.',
             ledgerAccountId
        })
     }
}

