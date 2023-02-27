import { Vis2Vec } from "/js/vis2vec.js";

var _vis2vec = new Vis2Vec();
_vis2vec.init().then(function () {
    let c = _vis2vec.predictPath();
    const elem = document.getElementById('single-char');
    elem.appendChild(c);
});

function downloadObjectAsJson(exportObj, exportName) {
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
    var downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", exportName + ".json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
// no argument provides a character
if (urlParams.has("get")) {
    // return a single character
    new Vis2Vec().init().then(function () {
        let cs = [];
        for (let i = 0; i < parseInt(urlParams.get("get")); i++) {
            let c = _vis2vec.predict();
            cs.push(c);
        }
        downloadObjectAsJson(cs, "pathArray"); // returns this as json
    }); // array of path elements
}
