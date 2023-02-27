import { Vis2Vec } from "/js/vis2vec.js";

var _vis2vec = new Vis2Vec();
_vis2vec.init().then(function () {
    let c = _vis2vec.predict();
    const elem = document.getElementById('single-char');
    elem.appendChild(c);
});
