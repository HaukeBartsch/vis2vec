#!/usr/bin/env node

//const [, , ...args] = process.argv
//console.log('Train a word2vec model on our own database file: ' + args[0])


function clearText(text) {
    return text
        .toLowerCase()
        .replace(/[^A-Za-zА-Яа-яЁёЇїІіҐґЄє0-9\-]|\s]/g, " ")
        .replace(/\s{2,}/g, " ");
}

const fs = require("fs-extra");
async function clear(filePath) {
    const contentRaw = await fs.readFile(filePath);
    var content = JSON.parse(contentRaw)
    var text = "";
    for (var i = 0; i < content.length; i++) {
        var ks = Object.keys(content[i]);
        for (var j = 0; j < ks.length; j++) {
            if (ks[j] == "id")
                continue; // don't use the ids
            if (typeof content[i][ks[j]] == "string" && content[i][ks[j]].length > 0) {
                var entry = clearText(content[i][ks[j]]);
                text += ks[j].toLowerCase() + " is " + entry + " ";
            }
        }
        text += "\n\n";
    }
    // const content = clearText(contentRaw.toString());
    return fs.writeFile(`cleared_${filePath}`, text);
}

function train(corpusFilePath) {
    const w2v = require("word2vec");
    w2v.word2vec(corpusFilePath, "vectors.txt", { size: 300 }, () => {
        console.log("DONE");
    });
}

function similarity(modelFilePath, word1, word2) {
    const w2v = require("word2vec");
    w2v.loadModel(modelFilePath, function (error, model) {
        console.log(model);
        console.log(model.similarity(word1, word2));
    });
}

function similar(modelFilePath, word) {
    const w2v = require("word2vec");
    w2v.loadModel(modelFilePath, function (error, model) {
        console.log(model);
        console.log(model.mostSimilar(word));
    });
}

function analogy(modelFilePath, word1, word2, word3) {
    const w2v = require("word2vec");
    w2v.loadModel(modelFilePath, function (error, model) {
        console.log(model);
        console.log(model.analogy(word1, [word2, word3]));
    });
}

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
    .command('database [filename]', 'convert a json database from dd to a cleared text file (output: cleared_database.json)', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'json with array of dictionaries',
                default: 'database.json'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`process: ${argv.filename} to get a cleared text file`)

        clear(argv.filename);
    })
    .command('train [filename]', 'train using a cleared text file as input (output vectors.txt)', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'text file with cleared text',
                default: 'cleared_database.txt'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`process: ${argv.filename} to train`)

        train(argv.filename);
    })
    .command('similarity [filename]', 'predict using the model (filename: vectors.txt) with --word1 A --word2 B', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'vectors.txt text file with model',
                default: 'vectors.txt'
            })
            .option('word1', {
                describe: 'word1 to use',
                default: 'bla'
            })
            .option('word2', {
                describe: 'word2 to use',
                default: 'bla'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`similarity using this model : ${argv.filename}` + " and words: " + argv.word1 + " " + argv.word2)

        similarity(argv.filename, argv.word1, argv.word2);
    })
    .command('similar [filename]', 'predict using the model (vectors.txt) with --word A', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'vectors.txt text file with model',
                default: 'vectors.txt'
            })
            .option('word', {
                describe: 'word to use',
                default: 'bla'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`similar words using this model: ${argv.filename}` + " and words: " + argv.word)

        similar(argv.filename, argv.word);
    })
    .command('analogy [filename]', 'get an analogy using the model (vectors.txt) with --word A', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'vectors.txt text file with model',
                default: 'vectors.txt'
            })
            .option('word1', {
                describe: 'word to use',
                default: 'bla'
            })
            .option('word2', {
                describe: 'word to use',
                default: 'bla'
            })
            .option('word3', {
                describe: 'word to use',
                default: 'bla'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`analogy words using this model: ${argv.filename}` + " and words: " + argv.word1 + " " + argv.word2 + " " + argv.word3)

        analogy(argv.filename, argv.word1, argv.word2, argv.word3);
    })
    .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging'
    })
    .parse()
