import { Injectable } from "@nestjs/common";
import { UsersController } from "./users.controller.js";



@Injectable()
export class UsersService {
    constructor(
        private readonly usersController: UsersController
    ){}
}