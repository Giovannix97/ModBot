"use strict";

const CosmosClient = require("@azure/cosmos").CosmosClient;
const { userDAO } = require('./userDAO')

class UserController {
    constructor() {
        // This client is a parameter for the DAO
        this.cosmosClient = new CosmosClient({
            endpoint: process.env.CosmosDbEndpoint ,
            key: process.env.CosmosDbKey
        })
        
        // Field for the persistence
        this.userDAO = new userDAO(this.cosmosClient);
    
    }


    /**
     * Inizialize the controller.
     */
    async init() {
        console.log("Initializing the controller...");
        await this.userDAO.init();
        console.log("Initializing the controller... Done!");   
    }


    /**
     * Add a new user to DB due to incorrect behavior.
     */
    async add_user() {
        // const newItem = {
            //     id: "1",
            //     partizione: "ciao",
            //     channel: "telegram",
            //     number_of_warnings: 1,
            //     isBanned: false
            //   };
            
        // await this.userDAO.addItem(newItem)
    }


    /**
     * Increment of one "number_of_warnings" property.
     */
    async update_number_of_warning() {

    }


    /**
     * Set the property "isBanned" to true in the DB.
     */
    async ban_user_on_db() {
        
    }

}


module.exports.UserController = UserController;

