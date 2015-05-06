Ext.define('Rally.example.BurnCalculator', {
    extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
    config: {
        completedScheduleStateNames: ['Accepted']
    },
    constructor: function(config) {
        this.initConfig(config);
        this.callParent(arguments);
    },
    getDerivedFieldsOnInput: function() {
        var completedScheduleStateNames = this.getCompletedScheduleStateNames();
        return [{
            "as": "Planned",
            "f": function(snapshot) {
                if (snapshot.PlanEstimate) {
                    return snapshot.PlanEstimate;
                }

                return 0;
            }
        }, {
            "as": "PlannedCompleted",
            "f": function(snapshot) {
                if (_.contains(completedScheduleStateNames, snapshot.ScheduleState) && snapshot.PlanEstimate) {
                    return snapshot.PlanEstimate;
                }

                return 0;
            }
        }];
    },
    getMetrics: function() {
        return [{
            "field": "Planned",
            "as": "Planned",
            "display": "line",
            "f": "sum"
        }, {
            "field": "PlannedCompleted",
            "as": "Completed",
            "f": "sum",
            "display": "column"
        }];
    }
});

Ext.define('Rally.example.BurnChart', {
    extend: 'Rally.app.App',
    requires: ['Rally.example.BurnCalculator'],
    launch: function() {
        Ext.define('ModelLoader', {
            singleton: true,
            beginLoadModels: function(models, callback, scope) {
                Rally.data.ModelFactory.getModels({
                    types: models,
                    context: {
                        // workspace: scope.context.getWorkspaceRef(),
                        // project: null //to query entire workspace
                    },
                    autoLoad: true,
                    success: callback,
                    scope: scope
                });
            }
        });
        Ext.define('PortfolioItemTypeLoader', {
            singleton: true,
            getModelNames: function(callback, scope) {
                Ext.create(Rally.data.WsapiDataStore, {
                    autoLoad: true,
                    remoteFilter: true,
                    model: 'TypeDefinition',
                    sorters: {
                        property: 'Ordinal',
                        direction: 'Desc'
                    },
                    filters: [{
                        property: 'Parent.Name',
                        operator: '=',
                        value: 'Portfolio Item'
                    }, {
                        property: 'Creatable',
                        operator: '=',
                        value: 'true'
                    }],
                    listeners: {
                        load: callback,
                        scope: scope
                    }
                });
            }
        });
        PortfolioItemTypeLoader.getModelNames(this._setModelNames, this);
    },
    _drawChart: function(PIID, chartTitle) {
        if (this.down('#buChart')) {
            this.remove('buChart');
        }
        this.add({
            xtype: 'rallychart',
            itemId: 'buChart',
            //             Black       Green     Red         Blue
            chartColors: ['#000000', '#89A54E', '#AA4643', '#3366FF'],
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getStoreConfig(PIID),
            calculatorType: 'Rally.example.BurnCalculator',
            calculatorConfig: {
                completedScheduleStateNames: ['Accepted', 'Released']
            },
            chartConfig: this._getChartConfig(chartTitle)
        });
    },
    _configureMessageListeners: function(models, piTypeNames) {
// console.log("subscribing...");
// console.log(models, piTypeNames);
        this.subscribe(this, Rally.Message.objectFocus, function(record) {
            this._itemSelected(record, models, piTypeNames);
        }, this);
    },
    _setModelNames: function(store, data) {
        var PILength = data.length;
// console.log("setModelNames");
        var piTypeNames = {};
        var typeDescription = "";
        for (var i = 0; i < data.length; i++) {
            typeDescription = data[i].get("TypePath").replace("/", "").toLowerCase();
            piTypeNames[typeDescription] = {
                Name: data[i].get("Name"),
                TypePath: data[i].get("TypePath"),
                ChildTypePath: data[i + 1] ? data[i + 1].get("TypePath") : 'UserStory'
            };
        }
        var piTypes = ['UserStory'];
        for (var key in piTypeNames) {
            if (key != "scheduledtestcase")
                piTypes.push(piTypeNames[key].TypePath);
        }
// console.log(piTypeNames);
        ModelLoader.beginLoadModels(piTypes, function(models) {
            this._configureMessageListeners(models, piTypeNames);
        }, this);
// console.log("end setModelNames");
    },
    _itemSelected: function(record, models, piTypeNames) {
// console.log("Item Selected:");
// console.log(record);            
        this._drawChart(record.get("ObjectID"), record.get("FormattedID") + " - " + record.get("Name"));
    },
    /**
     * Generate the store config to retrieve all snapshots for all leaf child stories of the specified PI
     */
    _getStoreConfig: function(PIID) {
        return {
            find: {
                _ItemHierarchy: PIID,
                _TypeHierarchy: 'HierarchicalRequirement',
                Children: null
            },
            fetch: ['ScheduleState', 'PlanEstimate'],
            hydrate: ['ScheduleState'],
            sort: {
                _ValidFrom: 1
            },
            context: this.getContext().getDataContext(),
            limit: Infinity
        };
    },
    /**
     * Generate a valid Highcharts configuration object to specify the chart
     */
    _getChartConfig: function(chartTitle) {
        return {
            chart: {
                defaultSeriesType: 'area',
                zoomType: 'xy'
            },
            title: {
                text: chartTitle
            },
            xAxis: {
                categories: [],
                tickmarkPlacement: 'on',
                tickInterval: 5,
                title: {
                    text: 'Date',
                    margin: 10
                }
            },
            yAxis: [{
                title: {
                    text: 'Points'
                }
            }],
            tooltip: {
                formatter: function() {
                    return '' + this.x + '<br />' + this.series.name + ': ' + this.y;
                }
            },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false,
                        states: {
                            hover: {
                                enabled: true
                            }
                        }
                    },
                    groupPadding: 0.01
                },
                column: {
                    stacking: null,
                    shadow: false
                }
            }
        };
    }
});