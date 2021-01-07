"use strict";

const path = require('path');
const dotenv = require('dotenv');
const { Console } = require('console');

// Import required bot configuration.
const ENV_FILE = path.join(__dirname, '.env');
dotenv.config({ path: ENV_FILE });


// Change this value with your partition
const partitionKey = "ciao"


class UserDAO {
  /**
   * Manages reading, adding, and updating Tasks in Cosmos DB
   * @param {CosmosClient} cosmosClient
   * @param {string} databaseId
   * @param {string} containerId
   */
  constructor(cosmosClient, databaseId, containerId) {
    this.client = cosmosClient
    this.databaseId = databaseId || process.env.DatabaseId;
    this.collectionId = containerId || process.env.ContainerId;

    if (!this.databaseId) throw ("You must specify a DatabaseID")
    if (!this.collectionId) throw ("You must specify a CollectionID/ContainerID")

    this.database = null
    this.container = null
  }


  async init() {
    console.log('Setting up the database...');
    const dbResponse = await this.client.databases.createIfNotExists({
      id: this.databaseId
    })
    this.database = dbResponse.database
    console.log('Setting up the database...done!');
    console.log('Setting up the container...');
    const coResponse = await this.database.containers.createIfNotExists({
      id: this.collectionId
    })
    this.container = coResponse.container
    console.log('Setting up the container...done!');
  }


  async find(querySpec) {
    debug('Querying for items from the database')
    if (!this.container) {
      throw new Error('Collection is not initialized.')
    }
    const { resources } = await this.container.items.query(querySpec).fetchAll()
    return resources
  }


  async addItem(item) {
    console.log('Adding an item to the database...');
    item.date = Date.now();
    item.completed = false;
    const { resource: doc } = await this.container.items.create(item);
    console.log('Adding an item to the database... done!');
    return doc;
  }


  async updateItem(itemId) {
    console.log('Updating an item in the database...');
    const doc = await this.getItem(itemId);
    // Property to modify
    doc.completed = true;

    const { resource: replaced } = await this.container
      .item(itemId, partitionKey)
      .replace(doc)

    console.log('Updating an item in the database... done!');
    return replaced;
  }


  async getItem(itemId) {
    debug('Getting an item from the database');
    const { resource } = await this.container.item(itemId, partitionKey).read();
    debug('Getting an item from the database... done!');
    return resource;
  }
}


module.exports.userDAO = UserDAO;