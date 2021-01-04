"use strict";

const { TextAnalyticsClient, AzureKeyCredential } = require("@azure/ai-text-analytics");

// TODO: sposta in .env
const key = '0766be4cd4a94ef58fa3fa820d4b649c';
const endpoint = 'https://provaanalisitesto.cognitiveservices.azure.com/';

// Authentication
const textAnalyticsClient = new TextAnalyticsClient(endpoint,  new AzureKeyCredential(key));


// Sentiment Analysis
async function sentimentAnalysis(sentimentInput) {

    const result = [];
    const sentimentResult = await textAnalyticsClient.analyzeSentiment(sentimentInput);

    await sentimentResult.forEach( document => {
        
        result[document.id] = document;

        console.log(`Result[doc]: ${result[document.id]}`)
        console.log(`ID: ${document.id}`);
        console.log(`\tDocument Sentiment: ${document.sentiment}`);
        console.log(`\tDocument Scores:`);
        console.log(`\t\tPositive: ${document.confidenceScores.positive.toFixed(2)} \tNegative: ${document.confidenceScores.negative.toFixed(2)} \tNeutral: ${document.confidenceScores.neutral.toFixed(2)}`);
        console.log(`\tSentences Sentiment(${document.sentences.length}):`);
        
        document.sentences.forEach(sentence => {
            console.log(`\t\tSentence sentiment: ${sentence.sentiment}`);
            console.log(`\t\tSentences Scores:`);
            console.log(`\t\tPositive: ${sentence.confidenceScores.positive.toFixed(2)} \tNegative: ${sentence.confidenceScores.negative.toFixed(2)} \tNeutral: ${sentence.confidenceScores.neutral.toFixed(2)}`);
        });
    });
    
    return result;
}

module.exports.sentimentAnalysis = sentimentAnalysis;