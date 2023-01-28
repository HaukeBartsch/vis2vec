#!/usr/bin/env node
// export NODE_OPTIONS=--max-old-space-size=12000

//const [, , ...args] = process.argv
//console.log('Train a word2vec model on our own database file: ' + args[0])

// lets read some chinese characters and treat them as sentences
// The alphabet is the path description where each stroke is a word.
// We want to create new strokes from random starting points later.

// all characters are on 1024x1024 with upper left 0...900 and lower right 1024...-124

//  we should mirror the strokes horizontally and vertically to get more data

/* to render a character we can do:

<svg viewBox="0 0 1024 1024">
  <g transform="scale(1, -1) translate(0, -900)">
    <path d="STROKE[0] DATA GOES HERE"></path>
    <path d="STROKE[1] DATA GOES HERE"></path>
    ...
  </g>
</svg>

*/

// we want more something like this: https://www.tensorflow.org/text/tutorials/text_generation


function clearText(text) {
    return text
        .toLowerCase()
        .replace(/[^A-Za-zА-Яа-яЁёЇїІіҐґЄє0-9\-]|\s]/g, " ")
        .replace(/\s{2,}/g, " ");
}

function powersOf2(x) {
    let v = [];
    while (x > 0) {
        v.push(x % 2);
        x = parseInt(x / 2, 10);
    }
    let w = []; // the powers of 2 needed
    for (var i = 0; i < v.length; i++) {
        if (v[i] == 1)
            w.push(i);
    }

    return w.reverse();
}

function pad(num, size) {
    num = num.toString();
    while (num.length < size) num = "0" + num;
    return num;
}

/* There are 1024x1024 possible locations. We therefore have about 1M points (words).
    Here we don't care about the coding because words will be replaced by numbers later
    anyway. Lets use a coding that we can understand - numbers for x and y. 
    
    In order to reduce the number of words we can:
     - make vector coordinates smaller by removing the start position from each
     - replace offset values with series of power's of 2.
    */

var splitQs = true;

const fs = require("fs-extra");
async function clear(filePaths) {

    var out = fs.createWriteStream("cleared_data/cleared.txt");

    var textAll = "";
    for (var f = 0; f < filePaths.length; f++) {
        var filePath = filePaths[f];
        console.log("read: " + filePath);
        const contentRaw = await fs.readFile(filePath);
        var content = JSON.parse(contentRaw)
        var chars = Object.keys(content);
        var cs = ["M", "Q", "Z", "C", "L", "S", "V", "H", "A"];
        for (var i = 0; i < chars.length; i++) {
            //if (i % 2 == 0)
            //    console.log(i + " of " + chars.length);
            var texts = ["", "", "", ""];
            var text = "";
            var text2 = "";
            var text3 = "";
            var text4 = "";
            var entry = content[chars[i]]["strokes"];
            for (var j = 0; j < entry.length; j++) {
                var re_start_coords = /M ([+\-0-9]*) ([+\-0-9]*)/;
                var matches = entry[j].match(re_start_coords);
                var xcoord = parseInt(matches[1]);
                var ycoord = parseInt(matches[2]);

                var stroke = entry[j].split(" "); // one stroke one sentence
                // what is the M coordinate for this entry?, lets remove it from all further coordinates
                // that should make all coordinates smaller and compress the number of possible texts
                x = 0;
                var isM = false;
                for (var k = 0; k < stroke.length; k++) {
                    if (cs.indexOf(stroke[k]) != -1) {
                        texts[0] += " " + stroke[k];
                        if (stroke[k] == "M")
                            isM = true;
                        else
                            isM = false;
                        x = 0;
                    } else {
                        var ii = parseInt(stroke[k]);
                        if (!isM) { // relative to M only if its not M itself
                            if (((x + 1) % 2) == 0) {
                                // even
                                ii -= xcoord;
                            } else {
                                // odd
                                ii -= ycoord;
                            }
                        }
                        //console.log("number: " + ii + " for: " + stroke[k]);
                        if (ii < 0) {
                            texts[0] += "-" + pad(-ii, 4);
                        } else {
                            texts[0] += "+" + pad(ii, 4);
                        }
                        x++;
                    }
                }
                // add a version that is flipped vertically and horizontally
                x = 0;
                var isM = false;
                for (var k = 0; k < stroke.length; k++) {
                    if (cs.indexOf(stroke[k]) != -1) {
                        texts[1] += " " + stroke[k];
                        if (stroke[k] == "M")
                            isM = true;
                        else
                            isM = false;
                        x = 0;
                    } else {
                        var ii = parseInt(stroke[k]);
                        if (!isM) { // relative to M only if its not M itself
                            if (((x + 1) % 2) == 0) {
                                // even
                                ii -= xcoord;
                            } else {
                                // odd
                                ii -= ycoord;
                            }
                        }
                        if ((x % 2) == 0) {
                            ii = -(ii - 512) + 512;
                        }
                        //console.log("number: " + ii + " for: " + stroke[k]);
                        if (ii < 0) {
                            texts[1] += "-" + pad(-ii, 4);
                        } else {
                            texts[1] += "+" + pad(ii, 4);
                        }
                        x++;
                    }
                }
                y = 0;
                var isM = false;
                for (var k = 0; k < stroke.length; k++) {
                    if (cs.indexOf(stroke[k]) != -1) {
                        texts[2] += " " + stroke[k];
                        if (stroke[k] == "M")
                            isM = true;
                        else
                            isM = false;
                        y = 0;
                    } else {
                        var ii = parseInt(stroke[k]);
                        if (!isM) { // relative to M only if its not M itself
                            if (((y + 1) % 2) == 0) {
                                // even
                                ii -= xcoord;
                            } else {
                                // odd
                                ii -= ycoord;
                            }
                        }
                        if (((y + 1) % 2) == 0) {
                            ii = -(ii - 388) + 388;
                        }
                        //console.log("number: " + ii + " for: " + stroke[k]);
                        if (ii < 0) {
                            texts[2] += "-" + pad(-ii, 4);
                        } else {
                            texts[2] += "+" + pad(ii, 4);
                        }
                        y++;
                    }
                }

                // we can also shift our characters around a bit if they are not too big
                // like if the bounding box has some space left and right, or just use all of them
                // and ignore that they might get bigger than 1024x1024
                var shifts = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
                for (var s = 0; s < shifts.length; s++) {
                    sx = shifts[s][0];
                    sy = shifts[s][1];
                    x = 0;
                    var isM = false;
                    for (var k = 0; k < stroke.length; k++) {
                        if (cs.indexOf(stroke[k]) != -1) {
                            texts[3] += " " + stroke[k];
                            if (stroke[k] == "M")
                                isM = true;
                            else
                                isM = false;
                            x = 0;
                        } else {
                            var ii = parseInt(stroke[k]);
                            if (!isM) { // relative to M only if its not M itself
                                if (((x + 1) % 2) == 0) {
                                    // even
                                    ii -= xcoord;
                                } else {
                                    // odd
                                    ii -= ycoord;
                                }
                            }
                            if (((y + 1) % 2) == 0) {
                                ii = ii + sy;
                            } else {
                                ii = ii + sx;
                            }
                            //console.log("number: " + ii + " for: " + stroke[k]);
                            if (ii < 0) {
                                texts[3] += "-" + pad(-ii, 4);
                            } else {
                                texts[3] += "+" + pad(ii, 4);
                            }
                            x++;
                        }
                    }
                }
            }
            var re6 = /C(?<g1>[+\-][0-9][0-9][0-9][0-9])(?<g2>[+\-][0-9][0-9][0-9][0-9])(?<g3>[+\-][0-9][0-9][0-9][0-9])(?<g4>[+\-][0-9][0-9][0-9][0-9])(?<g5>[+\-][0-9][0-9][0-9][0-9])(?<g6>[+\-][0-9][0-9][0-9][0-9])/;
            var re4 = /Q(?<g1>[+\-][0-9][0-9][0-9][0-9])(?<g2>[+\-][0-9][0-9][0-9][0-9])(?<g3>[+\-][0-9][0-9][0-9][0-9])(?<g4>[+\-][0-9][0-9][0-9][0-9])/;
            var re2 = /M(?<g1>[+\-][0-9][0-9][0-9][0-9])(?<g2>[+\-][0-9][0-9][0-9][0-9])/;
            var re2L = /L(?<g1>[+\-][0-9][0-9][0-9][0-9])(?<g2>[+\-][0-9][0-9][0-9][0-9])/;
            if (splitQs) {
                // if we have a Q+/-N+/-N+/-N+/-N, create more words: QX1+7 QX1+4 QY1+2 QX2-4 QY2-1
                // we need more words to make the dictionary smaller, instead of 0..1024 use steps of powers of 2
                // text = text.replace(re, "Q$1$2 Q$3$4");
                // now we have two fields each
                //texts = [text, text2, text3, text4];
                for (var t_idx = 0; t_idx < texts.length; t_idx++) {
                    var t = texts[t_idx];
                    text_pieces = t.split(" ");
                    for (var iii = 0; iii < text_pieces.length; iii++) {
                        var entry = text_pieces[iii];
                        var m = entry.match(re4);
                        if (m !== null) {
                            // we should have 4 matches[1]... matches[5]
                            var new_entry = "";
                            var jump = parseInt(m[1]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "QX1" + steps[j] + " ";
                                else
                                    new_entry += "QX1" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[2]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "QY1" + steps[j] + " ";
                                else
                                    new_entry += "QY1" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[3]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "QX2" + steps[j] + " ";
                                else
                                    new_entry += "QX2" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[4]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "QY2" + steps[j] + " ";
                                else
                                    new_entry += "QY2" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }

                            text_pieces[iii] = new_entry.trim();
                        }
                        var m = entry.match(re2);
                        if (m !== null) {
                            var new_entry = "";
                            var jump = parseInt(m[1]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "MX1" + steps[j] + " ";
                                else
                                    new_entry += "MX1" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[2]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "MY1" + steps[j] + " ";
                                else
                                    new_entry += "MY1" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            text_pieces[iii] = new_entry.trim();
                        }
                        var m = entry.match(re2L);
                        if (m !== null) {
                            var new_entry = "";
                            var jump = parseInt(m[1]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "LX1" + steps[j] + " ";
                                else
                                    new_entry += "LX1" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[2]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "LY1" + steps[j] + " ";
                                else
                                    new_entry += "LY1" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            text_pieces[iii] = new_entry.trim();
                        }

                        var m = entry.match(re6);
                        if (m !== null) {
                            var new_entry = "";
                            var jump = parseInt(m[1]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "CX1" + steps[j] + " ";
                                else
                                    new_entry += "CX1" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[2]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "CY1" + steps[j] + " ";
                                else
                                    new_entry += "CY1" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[3]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "CX2" + steps[j] + " ";
                                else
                                    new_entry += "CY2" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[4]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "CX3" + steps[j] + " ";
                                else
                                    new_entry += "CY3" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[5]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "CX4" + steps[j] + " ";
                                else
                                    new_entry += "CY4" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }
                            var jump = parseInt(m[6]);
                            var steps = powersOf2(jump < 0 ? -jump : jump);
                            for (var j = 0; j < steps.length; j++) {
                                if (steps[j] == 0)
                                    new_entry += "CX5" + steps[j] + " ";
                                else
                                    new_entry += "CY5" + (jump < 0 ? "-" : "+") + steps[j] + " ";
                            }

                            text_pieces[iii] = new_entry.trim();
                        }


                        // we need to change now matches0[1],  matches0[2], matches2[3], matches2[4]
                    }
                    texts[t_idx] = text_pieces.join(" ");
                }

                //text2 = text2.replace(re, "Q$1$2 Q$3$4");
                //text3 = text3.replace(re, "Q$1$2 Q$3$4");
                //text4 = text4.replace(re, "Q$1$2 Q$3$4");
            }
            for (var t_idx = 0; t_idx < texts.length; t_idx++) {
                out.write(texts[t_idx] + "\n\n");
            }
        }

        //textAll += text + text2 + text3 + text4;
    }

    // const content = clearText(contentRaw.toString());
    return out.close();
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
    .command('database [filename..]', 'convert a json database from dd to a cleared text file (output: cleared_database.json)', (yargs) => {
        return yargs
            .positional('filename', {
                describe: 'json with array of dictionaries',
                default: 'database.json'
            })
    }, (argv) => {
        if (argv.verbose)
            console.info(`process: ${argv.filename} to get a cleared text file`)

        clear(argv.filename);  // that is now an array
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
    }).command('$0', 'the default command', () => { }, (argv) => {
        console.log('Use --help to see option')
    })
    .parse()
