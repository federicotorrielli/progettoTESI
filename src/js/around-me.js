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
            this.checked_labels = list.sort();
        },
        getList() {
            let smt = this.checkLabels;
            for (let s in smt) {
                smt[s] = smt[s].replace(/ /g, "_");
            }
            return smt
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
            this.removeDuplicates();
        },
        removeDuplicates() {
            for (let s in this.checkLabels) {
                this.checkLabels[s] = this.checkLabels[s].replace(/_/g, " ");
            }
            this.checkLabels = [...new Set(this.checkLabels)];
        }
    }
});

let circleLayer = undefined;
let circleFigure = undefined;
let specialMarkerList = new Map();
let savedLayers = new Set();

let map = L.map('map', {
    center: [45.066277, 7.675744],
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
    if (e.layer.getRadius() > 370) {
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
let propSet;
let selectedLabelSet = [];
let colorRequest;

function jqueryRequest(e) {
    vue.checkLabels = []; // We want to reset the current checkLabel list for the new entries
    vue.allSelected = false; // We also want to preserve allSelected logic integrity
    savedLayers = new Set(); // Now we reset the savedLayers to diff between previous and current layers
    let geojsonReader = new jsts.io.GeoJSONReader();
    let geojsonWriter = new jsts.io.GeoJSONWriter();

    $.get("https://beta.ontomap.ontomap.eu/features?lat=" + e.getLatLng().lat + "&lng=" + e.getLatLng().lng + "&maxDistance=" + e.getRadius(), function (geoJsonFeature) {
        propSet = new Set();

        geoJsonFeature.features.forEach(item => {
            propSet.add(item.properties.otmClass);
        });

        propSet.forEach(val => {
            colorRequest = $.get("https://beta.ontomap.ontomap.eu/concepts/" + val + "/info",
                function (value) {
                    value.otmClass = val;
                    mappaColori.set(val, value);
                    if (value.hasOwnProperty('icon'))
                        mappaMarker.set(val, value)
                }
            );
        })

        const circle = turf.circle([e.getLatLng().lng, e.getLatLng().lat], e.getRadius() / 1000);
        let circleGeom = geojsonReader.read(circle);
        geoJsonFeature.features.forEach(item => {
            if (item.geometry.type === "MultiPoint") {
                item.geometry.type = "Point";
                item.geometry.coordinates = item.geometry.coordinates[0];
            }
            let geom = geojsonReader.read(item);
            const intersect = circleGeom.geometry.intersection(geom.geometry);
            if (!intersect) {
                return;
            } else {
                geom = geojsonWriter.write(intersect);
                item.geometry = geom;
            }

            circleLayer = L.geoJSON(geom, {
                onEachFeature(feature, layer) {
                    let icon;
                    layer.uniqueID = '_' + Math.random().toString(36).substr(2, 9);

                    $.when(colorRequest).done(function () {
                        if (mappaMarker.get(item.properties.otmClass) != null)
                            icon = new L.icon({
                                iconUrl: "https://beta.ontomap.ontomap.eu" + mappaMarker.get(item.properties.otmClass).icon,
                                iconRetinaUrl: "https://beta.ontomap.ontomap.eu" + mappaMarker.get(item.properties.otmClass).iconRetina,
                                iconSize: [25, 41],
                                iconAnchor: [12, 40],
                                popupAnchor: [1, -38]
                            });
                        if (icon === undefined || layer.setIcon === undefined) {
                            if (mappaColori.get(item.properties.otmClass) !== undefined && mappaColori.get(item.properties.otmClass).hasOwnProperty("color"))
                                layer.setStyle({
                                    color: mappaColori.get(item.properties.otmClass).color,
                                    fillOpacity: 0.9,
                                    editable: false
                                });
                        } else layer.setIcon(icon);
                        try {
                            layer.otmClass = mappaColori.get(item.properties.otmClass).otmClass;
                        } catch (e) {
                            map.removeLayer(layer);
                        }
                        layer.selected = false;
                    });
                    let link = $('<div style="overflow: hidden"><b>' + item.properties.label + '</b></div>').append($('<br><div style="text-align: center; float: left"><img id="saved" src="https://evilscript.altervista.org/images/star.png" alt="Salva posizione"></div>').click(function () {
                        let layerCentre;
                        if (!layer.hasOwnProperty("_icon")) {
                            layerCentre = Object.is(layer.getLatLngs()[0][0], undefined) ? layer.getCenter() : layer.getLatLngs()[0][0];
                            if (layerCentre.length > 1)
                                layerCentre = layerCentre[0];
                        }

                        if (layer.myTag !== "favorite") {

                            vue.addMarker(layer); // TODO: this is a stub

                            $("#saved").attr('src', "https://evilscript.altervista.org/images/iconfinder_star_285661.svg");
                            layer.myTag = "favorite";
                            if (layer.options.color !== undefined) {
                                specialMarkerList.set(layer.uniqueID, new L.marker(layerCentre, {
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
                                map.removeLayer(specialMarkerList.get(layer.uniqueID));
                                specialMarkerList.delete(layer.uniqueID);
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
            map.pm.enableGlobalDragMode();
            filterButton.addTo(map);
            map.addLayer(circleLayer);
            $('#filtraOggetti').modal('show');
        });

        $.when(colorRequest).done(function () {
            cleanLayers();
            let text = [];
            propSet.forEach((val) => {
                text.push(val);
            })
            for (const t in text) {
                text[t] = text[t].replace(/_/g, " ");
            }
            vue.addList(text);
        });
    });
}

function removalHandler(circle, bool) {
    filterButton.removeFrom(map); // alternatively .disable()
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
    selectItemsToBeDisplayed();
}

function selectItemsToBeDisplayed() {
    savedLayers.forEach(function (l) {
        if (l.selected === true) {
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

function cleanLayers() {
    map.eachLayer(function (layer) {
        if (layer.hasOwnProperty('otmClass') && !selectedLabelSet.includes(layer.otmClass)) {
            if (layer.myTag !== "favorite") {
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
$("#filtraOggetti").on("hidden.bs.modal", function () {
    saveLabels();
})
map.pm.Draw.Circle._syncCircleRadius = function _syncCircleRadius() {

    let A = this._centerMarker.getLatLng();

    let B = this._hintMarker.getLatLng();

    let distance = A.distanceTo(B);
    if (distance < 370) {
        this._layer.setRadius(distance);
    }
}

// Updatable spinner with jquery
const $loading = $('#spinner').hide();
/*
$(document)
    .ajaxStart(function () {
        $loading.show();
    })
    .ajaxStop(function () {
        $loading.hide();
    });

 */