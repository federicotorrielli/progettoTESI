const vue = new Vue({
    el: '#some',
    data: {
        saved_markers: [],
        checked_labels: [],
        checkLabels: [],
        allSelected: false
    },
    methods: {
        addMarker(marker) {
            this.saved_markers.push(marker);
        },
        removeMarker(marker) {
            let i = this.saved_markers.map(item => item.id).indexOf(marker);
            this.saved_markers.splice(i, 1);
        },
        printMarkers() {
            console.log(this.saved_markers);
        },
        addItem(item) {
            this.checked_labels.push(item);
        },
        removeItem(item) {
            let i = this.checked_labels.map(items => items.id).indexOf(item);
            this.checked_labels.splice(i, 1);
        },
        addList(list) {
            this.checked_labels = list;
        },
        getList() {
            let smt = this.checkLabels;
            for (let s in smt) {
                smt[s] = smt[s].replace(/ /g, "_");
            }
            return smt;
        },
        selectAll() {
            this.checkLabels = [];

            if (!this.allSelected) {
                for (const label in this.checked_labels) {
                    this.checkLabels.push(this.checked_labels[label])
                }
            }
        },
        select() {
            this.allSelected = false;
        }
    }
});

let circleLayer = undefined;
let circleFigure = undefined;
let specialMarkerList = new Map();
let savedLayers = new Set();

let map = L.map('map', {
    center: [45.0709823, 7.6777233],
    minZoom: 2,
    zoom: 15
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: ['a', 'b', 'c']
}).addTo(map);

map.pm.addControls({
    position: 'topright',
    drawMarker: false,
    drawPolyline: false,
    drawRectangle: false,
    drawPolygon: false,
    drawCircleMarker: false,
    drawCircle: true,
    editMode: false,
    dragMode: true,
    removalMode: true,
    cutPolygon: false,
});

const customTranslation = {
    buttonTitles: {
        drawCircleButton: 'Clicca per attivare la lente di esplorazione, poi seleziona il punto della mappa su cui posizionarla'
    },
    actions: {
        cancel: 'Disattiva la lente'
    },
    tooltips: {
        startCircle: 'Clicca per posizionare il centro della lente nella mappa',
        finishCircle: 'Clicca per definire il raggio della lente'
    }
};
map.pm.setLang('lensChange', customTranslation, 'it');

async function clickHandler(e) {
    if (e.layer.getRadius() > 450) {
        attivaToast("Il cerchio è troppo grande, riprova!", "error", "#e74c3c");
        map.removeLayer(e.layer)
        return;
    }

    if (circleLayer !== undefined && circleFigure !== undefined)
        removalHandler(circleFigure, true);

    circleFigure = e.layer;
    circleFigure.on('pm:dragend', ev => editHandler(ev));
    jqueryRequest(e.layer);
}

let mappaColori = new Map();
let mappaMarker = new Map();
let labelSet;
let selectedLabelSet = [];
let colorRequest;

function jqueryRequest(e) {
    vue.checkLabels = []; // We want to reset the current checkLabel list for the new entries
    vue.allSelected = false; // We also want to preserve allSelected logic integrity
    savedLayers = new Set(); // Now we reset the savedLayers to diff between previous and current layers

    $.get("https://beta.ontomap.ontomap.eu/features?lat=" + e.getLatLng().lat + "&lng=" + e.getLatLng().lng + "&maxDistance=" + e.getRadius(), function (geoJsonFeature) {
        labelSet = new Set();
        geoJsonFeature.features.forEach((item, i) => {
            colorRequest = $.get("https://beta.ontomap.ontomap.eu/concepts/" + item.properties.otmClass + "/info",
                function (value) {
                    value.otmClass = item.properties.otmClass;
                    mappaColori.set(item.properties.label, value);
                    if (value.hasOwnProperty('icon'))
                        mappaMarker.set(item.properties.label, value)
                    labelSet.add(item.properties.otmClass);
                }
            );
        });
        geoJsonFeature.features.forEach((item, i) => {
            let circle = turf.circle([e.getLatLng().lng, e.getLatLng().lat], e.getRadius() / 1000);
            let intersect = turf.intersect(circle, item);
            circleLayer = L.geoJSON(intersect, {
                onEachFeature(feature, layer) {
                    let icon;
                    $.when(colorRequest).done(function (v1) {
                        if (mappaMarker.get(item.properties.label) != null)
                            icon = new L.icon({
                                iconUrl: "https://beta.ontomap.ontomap.eu" + mappaMarker.get(item.properties.label).icon,
                                iconRetinaUrl: "https://beta.ontomap.ontomap.eu" + mappaMarker.get(item.properties.label).iconRetina,
                                iconSize: [25, 41],
                                iconAnchor: [12, 40],
                                popupAnchor: [1, -38]
                            });
                        if (icon === undefined || layer.setIcon === undefined)
                            layer.setStyle({
                                color: mappaColori.get(item.properties.label).color,
                                fillOpacity: 0.9,
                                editable: false
                            });
                        else layer.setIcon(icon);
                        layer.otmClass = mappaColori.get(item.properties.label).otmClass;
                        layer.selected = false;
                    });
                    let link = $('<div style="overflow: hidden"><b>' + item.properties.label + '</b></div>').append($('<br><div style="text-align: center; float: left"><img id="saved" src="https://evilscript.altervista.org/images/star.png" alt="Salva posizione"></div>').click(function () {
                        if (layer.myTag !== "favorite") {

                            vue.addMarker(layer); // TODO: this is a stub

                            $("#saved").attr('src', "https://evilscript.altervista.org/images/iconfinder_star_285661.svg");
                            layer.myTag = "favorite";
                            if (layer.options.color !== undefined) {
                                specialMarkerList.set(layer.getLatLngs()[0][0], new L.marker(layer.getLatLngs()[0][0], {
                                    icon: new L.Icon({
                                        iconUrl: 'https://evilscript.altervista.org/images/marker-icon-starred.png',
                                        iconSize: [25, 41],
                                        iconAnchor: [12, 40],
                                        popupAnchor: [1, -38],
                                    }), title: item.properties.label
                                }).addTo(map).bindPopup(L.responsivePopup({maxHeight: 200}, layer).setContent(link)));
                            } else
                                layer.setIcon(new L.Icon({
                                    iconUrl: 'https://evilscript.altervista.org/images/marker-icon-starred.png',
                                    iconSize: [25, 41],
                                    iconAnchor: [12, 40],
                                    popupAnchor: [1, -38],
                                }));
                            attivaToast("Posizione salvata", "info", "#2980b9");
                        } else {

                            vue.removeMarker(layer); // TODO: this is the other stub, same as before

                            $("#saved").attr('src', "https://evilscript.altervista.org/images/star.png");
                            layer.myTag = "circleLayer";
                            if (layer.options.color !== undefined) {
                                map.removeLayer(specialMarkerList.get(layer.getLatLngs()[0][0]));
                                specialMarkerList.delete(layer.getLatLngs()[0][0]);
                            } else
                                layer.setIcon(icon);
                            attivaToast("Posizione cancellata", "info", "#e74c3c");
                        }
                    })).append('<div style="float: right"><img src="https://evilscript.altervista.org/images/iconfinder_sign-info_299086.svg"/></div>')[0];
                    if (layer.myTag === undefined)
                        layer.myTag = "circleLayer";
                    layer.bindPopup(L.responsivePopup({maxHeight: 200}, layer).setContent(link));

                    // Questi due attributi disattivano il trascinamento dei marker sulla mappa
                    layer._pmTempLayer = true;
                    layer._dragDisabled = true;
                }
            });
            circleLayer.addTo(map);
            map.pm.enableGlobalDragMode();
            filterButton.addTo(map);
            $('#filtraOggetti').modal('show');
        });

        $.when(colorRequest).done(function () {
            let text = Array.from(labelSet);
            for (let t in text) {
                text[t] = text[t].replace(/_/g, " ");
            }
            vue.addList(text);
        });
    });
}

function removalHandler(circle, bool) {
    filterButton.removeFrom(map); //in alternativa basta usare .disable()
    map.eachLayer(function (layer) {
        if (layer.myTag && layer.myTag === "circleLayer")
            map.removeLayer(layer);
    });
    if (bool)
        map.removeLayer(circle);
}

function editHandler(e) {
    if (circleLayer !== undefined && circleFigure !== undefined)
        removalHandler(circleFigure, false);

    circleFigure = e.target;
    jqueryRequest(e.target);
}

function attivaToast(dati, cond, bgColor) {
    $.toast({
        text: dati,
        heading: 'Avviso',
        icon: cond,
        showHideTransition: 'fade',
        allowToastClose: true,
        hideAfter: 3000,
        stack: 5,
        position: 'bottom-left',
        textAlign: 'left',
        loader: true,
        loaderBg: '#9EC600',
        bgColor: bgColor,
    });
}

function saveLabels() {
    selectedLabelSet = vue.getList();
    console.log(selectedLabelSet);
}

function selectItemsToBeDisplayed() {
    savedLayers.forEach(function (l) {
        if (l.selected === true) {
            console.log(l);
            map.addLayer(l);
            l.selected = false;
        }
    });

    map.eachLayer(function (layer) {
        if (layer.hasOwnProperty('otmClass') && !selectedLabelSet.includes(layer.otmClass)) {
            if (layer.myTag !== "favorite" && layer.selected !== true) {
                map.removeLayer(layer);
                layer.selected = true;
                savedLayers.add(layer);
            }
        }
    });
}

let filterButton = L.easyButton({
    states: [{
        stateName: 'startState',
        icon: 'fa-filter',
        title: 'Filtra i risultati nel cerchio',
        onClick: function (btn, map) {
            $('#filtraOggetti').modal('show');
        }
    }]
});

map.on('pm:create', e => clickHandler(e), {passive: true});
map.on('pm:remove', e => removalHandler(e), {passive: true});
map.pm.Draw.Circle._syncCircleRadius = function _syncCircleRadius() {

    let A = this._centerMarker.getLatLng();

    let B = this._hintMarker.getLatLng();

    let distance = A.distanceTo(B);
    if (distance < 450) {
        this._layer.setRadius(distance);
    }
}