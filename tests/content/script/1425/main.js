
function MapLoadingIndicator(m){
try{
this.m=m;
this.el=document.createElement('div');
this.el.innerHTML='Loading, please wait...';
this.el.className='map-loading-indicator';
this.el.id='map-loading-indicator-'+String.random(20);
this.el.style.display='none';
this.m.getContainer().appendChild(this.el);
this.el=$(this.el.id);
this.setContent=function(v){this.el.innerHTML=v;};
this.show=function(persistent){if(!this.el.visible()){Effect.Appear(this.el,{duration:0.5});}this.persistent=!!persistent;};
this.hide=function(force){if(this.persistent&&!force){return;}if(this.el.visible()){Effect.Fade(this.el,{duration:0.5});}};
return this;
}catch(e){MyPlace.e(e,'creating map loading indicator overlay');}
}
MapLoadingIndicator.prototype=new GControl(true,false);
MapLoadingIndicator.prototype.getDefaultPosition=function(){return new GControlPosition(G_ANCHOR_TOP_RIGHT,new GSize(30,56));};
var interface={
name:'main',
initialize:function(){
try{
MyPlace.log('/interface/main','ha');
MyPlace.navHistory.initialize(function(t){if(t){MyPlace.interface.tab(t.replace(/^h\:/,''),true);}else{MyPlace.interface.tab(MyPlace.interface.initTab,true);}});
if(MyPlace.browser.isIE){MyPlace.navHistory.add('h:'+CURRENT_TAB);}
MyPlace.callback(this.updateMyPlace(),this,null,true);
this.currentTab=CURRENT_TAB;
this.initTab=CURRENT_TAB;
MyPlace.callback(function(){
if(MyPlace.env.mapEnabled){
$('myplace-layers').innerHTML=new MyPlace.XTemplate('<ul id="layers">',
'<tpl for="layers">',
'<li id="{name}-li">',
'<div class="layer">',
'<input id="{name}-checkbox" name="{name}-checkbox" type="checkbox" onclick="MyPlace.interface.updateMap({action: \'togglelayer\', layer: \'{name}\', fromCheckbox: true})" />',
' <span class="layerlink" onclick="MyPlace.interface.updateMap({action: \'toggleexpand\', layer: \'{name}\'});" class="nolinkprint">',
'<img width="18" height="20" src="{parent.env.appPath}images/spacer.gif" />',
'<img width="20" height="20" src="{parent.env.appPath}images/icons/map/{name}-key.gif" class="key" />',
' <a id="{name}-text-link" href="javascript:void(0);" class="nolinkprint">{displayName}</a>',
'</span>',
'<span class="visibility-warning" style="display:none;"></span>',
'<div class="layer-list-loading"></div>',
'</div>',
'<div id="{name}-feature-list" class="layer-feature-list" style="display: none;"></div>',
'</li>',
'</tpl>',
'</ul>').apply(MyPlace);
MyPlace.layers.each(function(v){
if(v.type==='point'){
v.gIcon=new GIcon({
image:MyPlace.env.appPath+'images/icons/map/'+v.name+'.png',
shadow:MyPlace.env.appPath+'images/icons/map/map-icon-shadow.png',
iconSize:new GSize(24,37),
shadowSize:new GSize(53,40),
iconAnchor:new GPoint(12,37),
infoWindowAnchor:new GPoint(12,0),
transparent:MyPlace.env.appPath+'images/icons/map/map-icon-transparent.png',
imageMap:[0,3,3,0,21,0,24,3,24,21,21,24,15,24,13,37,11,37,9,24,3,24,0,21]
});
}
});
$$('.crown-copyright').each(function(v){v.innerHTML=MyPlace.env.crownCopyright;});
var c={};
if(MyPlace.getParam('location')){
c.location=MyPlace.getParam('location');
}else if(MyPlace.getParam('id')){
c.location=MyPlace.getParam('id');
}else if(!isNaN(parseFloat(MyPlace.getParam('lat')))&&!isNaN(parseFloat(MyPlace.getParam('lng')))){
c.location=new GLatLng(parseFloat(MyPlace.getParam('lat')),parseFloat(MyPlace.getParam('lng')));
}else if(MyPlace.userLocation.isValid){
c.location=new GLatLng(MyPlace.userLocation.lat,MyPlace.userLocation.lng);
c.zoom=15;
}else{
c.location=new GLatLng(51.59816,-0.0182395);
c.zoom=12;
}
c.action=MyPlace.getParam('action').toLowerCase()||null;
c.layer=MyPlace.getParam('layer').toLowerCase()||null;
c.mapType=MyPlace.getParam('maptype').toLowerCase()||null;
c.zoom=parseInt(MyPlace.getParam('zoom'),10)||c.zoom||12;
c.travelMode=c.action==='showdirections'?['walking','w'].include(MyPlace.getParam('travelmode').toLowerCase())?'w':'d':null;
this.initConfig=Object.clone(c);
if(c.action==='showdirections'&&!MyPlace.userLocation.isValid){
MyPlace.interface.notices.add({id:'directions-no-user-location',message:'Directions cannot be displayed until you have <a href="javascript:void(0);" onclick="MyPlace.interface.highlightAddressSearch();" class="nolinkprint">set your location</a>'});
c.action=null;
}
MyPlace.callback(this.updateMap,this,[c],true);
}else{
MyPlace.callback(this.updateCurrentTab(),this,null,true);
}
},this,null,true);
}catch(e){MyPlace.e(e,'initializing user interface');}
},
tab:function(t,n){
try{
if(t==='map-tab'&&!MyPlace.env.mapEnabled){return;}
if(!n){MyPlace.log('/tab/'+t,'ha');}
$$('.picture-news-tabs li').each(function(v){v.removeClassName('selected');});
$$('.picture-news-tabs li#'+t)[0].addClassName('selected');
var s=$$('.picture-news-tabs li.selected a');
if(s.length){s[0].replace('<h2>'+s[0].innerHTML+'</h2>');}
$$('.picture-news-tabs li:not(.selected)').each(function(l){
$$('#'+l.id+' a, #'+l.id+' h2').each(function(e){e.replace('<a href="javascript:void(0);" onclick="MyPlace.interface.tab(\''+l.id+'\');" class="nolinkprint">'+e.innerHTML+'</a>');}.bind(this));
});
MyPlace.interface.currentTab=t;
if(t==='map-tab'){
$('interactive-map').style.visibility='visible';
$('interactive-map').style.position='relative';
$('interactive-map').style.top='auto';
$$('.maponly').invoke('show');
document.title='My Place in Waltham Forest - interactive map';
}else{
$$('#interactive-map').each(function(el){el.style.visibility='hidden';el.style.position='absolute';el.style.top=0;});
$$('.maponly').invoke('hide');
}
if(t==='summary-tab'){
$('myplace-summary-wrap').show();
document.title='My Place in Waltham Forest - places and services near me';
}else{
$('myplace-summary-wrap').hide();
}
if(t==='help-tab'){
$('myplace-help-wrap').show();
document.title='My Place in Waltham Forest - help';
}else{
$('myplace-help-wrap').hide();
}
if(!n){MyPlace.navHistory.add('h:'+t,false);}
MyPlace.interface.updateCurrentTab();
}catch(e){MyPlace.e(e,'switching between tabs');}
},
updateCurrentTab:function(){
try{
switch(MyPlace.interface.currentTab){
case'map-tab':
if(MyPlace.map){MyPlace.map.checkResize();}
break;
case'summary-tab':
MyPlace.interface.updateSummaryTab();
break;
case'help-tab':
if($('myplace-help').hasClassName('loading')){
MyPlace.callback(function(){
MyPlace.ajax({
url:MyPlace.env.interfacePath+'help/help.asp',
errorMessage:'Error loading help text',
expectJSON:false,
method:'get',
onSuccess:function(v,t){
$('myplace-help').innerHTML=v;
$('myplace-help').removeClassName('loading');
Effect.Fade('myplace-help-loading',{duration:0.5});
}
});
},this,null,true);
}
break;
}
}catch(e){MyPlace.e(e,'updating tab');}
},
highlightAddressSearch:function(){
try{
MyPlace.log('/highlight-address-search','ha');
if($('navigation').viewportOffset().top<=0){MyPlace.ScrollTo('navigation');}
var a=new Effect.Highlight('myplace-header',{queue:'end',duration:2,startcolor:'#FF5F65'});
}catch(e){MyPlace.e(e,'highlighting address search form');}
},
resetUserLocation:function(){
try{
MyPlace.resetUserLocation();
MyPlace.interface.homeMarker(true);
if(!MyPlace.map.getInfoWindow().isHidden()){$$('.directions-links').each(function(el){el.innerHTML=MyPlace.interface.getDirectionsLinks();});}
this.updateMyPlace();
}catch(e){MyPlace.e(e,'resetting your location');}
},
updateMyPlace:function(){
try{
var s;
MyPlace.log('/update-myplace','h');
if(MyPlace.userLocation.isValid){
s=['<div id="myplace-description">',
'<p class="home-icon">My place is <strong>'+MyPlace.userLocation.address+'</strong></p>',
'<ul>',
(MyPlace.env.mapEnabled?'<li class="locate-g icon"><a href="javascript:void(0);" onclick="MyPlace.interface.tab(\'map-tab\'); MyPlace.interface.updateMap({action: \'home\', zoom: 15});" class="nolinkprint">Centre on map</a></li>':''),
(MyPlace.env.mapEnabled?'<li class="list-g icon myplace-summary-link"><a href="javascript:void(0);" onclick="MyPlace.interface.tab(\'summary-tab\');" class="nolinkprint">Places and services near me</a></li>':''),
'<li class="revert-g icon"><a href="javascript:void(0);" onclick="MyPlace.interface.resetUserLocation();" class="nolinkprint">Change my place</a></li>',
'<li class="tick-g icon"><a href="http://www.walthamforest.gov.uk/myplace-about.htm" target="_blank">Terms of service</a></li>',
'</ul>'].join('');
if(MyPlace.userLocation.property.badPositionalAccuracy){s+='<hr /><h3 class="warning icon">IMPORTANT NOTICE</h3><p>Your property is one of a small number that we have not yet accurately positioned on a map. Distances shown may be inaccurate, but because you have shown an interest in this service your property has been placed on a priority list to be resolved.</p>';}
s+='</div>';
$('myplace-header').innerHTML=s;
if(MyPlace.map){
MyPlace.interface.homeMarker(!MyPlace.map.getInfoWindow().isHidden()||(MyPlace.interface.notices.get('directions-no-user-location')&&MyPlace.interface.initAction==='showdirections'&&!MyPlace.interface.pendingDirectionsComplete));
if(!MyPlace.map.getInfoWindow().isHidden()){$$('.directions-links').each(function(el){el.innerHTML=MyPlace.interface.getDirectionsLinks();});}
if(MyPlace.interface.notices.get('directions-no-user-location')){
MyPlace.log('/show-pending-directions','h');
MyPlace.interface.notices.remove('directions-no-user-location');
if(MyPlace.interface.initConfig.action==='showdirections'&&!MyPlace.interface.pendingDirectionsComplete){
MyPlace.interface.updateMap(MyPlace.interface.initConfig);
MyPlace.interface.pendingDirectionsComplete=true;
}
}
}
if(MyPlace.interface.currentTab==='summary-tab'){
MyPlace.interface.updateSummaryTab();
}else{
$('myplace-summary').innerHTML='';
$('myplace-summary-loading').show();
}
}else{
s='<div id="myplace-address-search"><form id="address-search-form" onsubmit="return false;" class="light"><label for="address_q">My Place:</label><input name="address_q" id="address_q" type="text" value="Enter postcode or address" class="default" />'+MyPlace.formButton('Search')+'</form><br class="cl" /></div>';
s+='<div id="myplace-detail"><img src="'+MyPlace.env.appPath+'images/icons/32/lightbulb.gif" width="24" height="32" class="floated-icon-left" /><p><strong>Personalise this page!</strong><br />Search for your address using the form above to see distances, directions, local services and information</p>';
$('myplace-header').innerHTML=s;
MyPlace.addressPicker.initialize({form:$('address-search-form'),searchInput:$('address_q'),resultsEl:$('myplace-detail')});
MyPlace.addressPicker.selectCallback=this.updateMyPlace.bind(this);
$('myplace-summary').innerHTML='<div id="myplace-summary-welcome"><h3>Set your location</h3><p>Before this page can be displayed, you must <a href="javascript:void(0);" onclick="MyPlace.interface.highlightAddressSearch();" class="nolinkprint">set your location</a>.</p><p>Once you have set your location, this page will give you an overview of local services and relevant to <strong><em>you</em></strong>.</p></div>';
$('myplace-summary-loading').hide();
}
if(MyPlace.map){MyPlace.interface.updateMap({action:'updateexpanded'});}
}catch(e){MyPlace.e(e,'updating personalised content for your home location');}
},
updateSummaryTab:function(){
try{
if(MyPlace.userLocation.isValid&&MyPlace.userLocation.detail!==3){
$('myplace-summary').innerHTML='';
$('myplace-summary-loading').show();
MyPlace.userLocation.detail=3;
MyPlace.userLocation.get(false,function(){
MyPlace.applyConfig(MyPlace.userLocation,{
p:MyPlace.userLocation.property
});
var layerSubSection=[
'<div class="subsection">',
'<h4>Your nearest {[this.layerName(values)]}</h4>',
'<tpl for="features.pluck(\'type\').uniq().sort().collect(function(v) { return {type: v}; })">',
'<tpl if="parent.features.find(function(v) { return v[\'type\'] === values.type; })">',
'<tpl if="type"><h5>{type}</h5></tpl>',
'<ul>',
'<tpl for="parent.features.findAll(function(v) { return v[\'type\'] === values.type; }).each(function(v) { v.layer = parent.name; })">',
'{[this.feature(values)]}',
'</tpl>',
'</ul>',
'</tpl>',
'</tpl>',
'</div>'
].join('');
$('myplace-summary').innerHTML=new MyPlace.XTemplate('',
'<div id="myplace-summary-democracy" class="section">',
'<h3>Your local democracy</h3>',
'<div class="body">',
'<div class="subsection">',
'<h4>Your councillors</h4>',
'<ul class="councillors">',
'{[this.cllr(values.p, 1)]}',
'{[this.cllr(values.p, 2)]}',
'{[this.cllr(values.p, 3)]}',
'</ul>',
'<br class="cl" />',
'</div>',
'<hr />',
'<div class="subsection">',
'<h4>Voting</h4>',
'<ul>',
'<li class="map-feature" style="background-image: url('+MyPlace.env.appPath+'images/icons/map/councilwards-key.gif);">You live in <strong>{[this.featureBalloonLink("councilwards", values.p.councilWardId, values.p.councilWardName)]}</strong> {[this.mapLink("councilwards", values.p.councilWardId, values.p.councilWardName)]}<div id="myplace-summary-balloon-councilwards-{values.p.councilWardId}" class="myplace-summary-balloon" style="display: none;"></div></li>',
'<li class="map-feature" style="background-image: url('+MyPlace.env.appPath+'images/icons/map/pollingstations-key.gif);">Your polling station is <strong>{[this.featureBalloonLink("pollingstations", values.p.pollingStationId, values.p.pollingStationName)]}</strong> <em class="extra-detail">{values.p.pollingStationDistance:toDistance(true)}</em>{[this.mapLink("pollingstations", values.p.pollingStationId, values.p.pollingStationName)]}<div id="myplace-summary-balloon-pollingstations-{values.p.pollingStationId}" class="myplace-summary-balloon" style="display: none;"></div></li>',
'</ul>',
'</div>',
'</div>',
'<div class="c nw"></div><div class="c ne"></div><div class="c sw"></div><div class="c se"></div>',
'</div>',
'<div class="spacer-1em"></div>',
'<div id="myplace-summary-area" class="section">',
'<h3>Your local area</h3>',
'<div class="body">',
'<div class="subsection">',
'<h4>Parking</h4>',
'<ul><li class="map-feature" style="background-image: url('+MyPlace.env.appPath+'images/icons/map/controlledparkingzones-key.gif);">You are <tpl if="values.p.controlledParkingZoneName">in the <strong>{[this.featureBalloonLink("controlledparkingzones", values.p.controlledParkingZoneId, values.p.controlledParkingZoneName)]}</strong>{[this.mapLink("controlledparkingzones", values.p.controlledParkingZoneId, values.p.controlledParkingZoneName)]}<div id="myplace-summary-balloon-controlledparkingzones-{values.p.controlledParkingZoneId}" class="myplace-summary-balloon" style="display: none;"></div></tpl><tpl if="!values.p.controlledParkingZoneName">not in a controlled parking zone</tpl></li></ul>',
'</div>',
'<tpl for="nearest.findAll(function(v) { return v.level3Group === \'area\'; })">',
'<hr />',
layerSubSection,
'</tpl>',
'</div>',
'<div class="c nw"></div><div class="c ne"></div><div class="c sw"></div><div class="c se"></div>',
'</div>',
'<div class="spacer-1em"></div>',
'<div id="myplace-summary-services" class="section">',
'<h3>Your local services</h3>',
'<div class="body">',
'<div class="subsection">',
'<h4>Your property</h4>',
'<ul>',
'<tpl if="values.p.councilTaxBand">',
'<li class="house-g icon">Your property is in <a href=""http://www.walthamforest.gov.uk/valuation.htm"">Council tax band <strong>{values.p.councilTaxBand}</strong></a> ({values.p.councilTaxBill:toMoney} excluding discounts)</li>',
'</tpl>',
'</ul>',
'<hr />',
'<h4>Waste collection</h4>',
'<ul>',
'<tpl if="values.p.domesticWasteDay">',
'<li class="refuse-g icon">',
'<tpl if="values.p.domesticWasteDay === \'never\'">There is no household waste collection for your property</tpl>',
'<tpl if="values.p.domesticWasteDay !== \'never\'">Your household waste is collected <strong>{values.p.domesticWasteDay}</strong><br /><em class="extra-detail indent-16">Your next household waste collection is on {values.p.domesticWasteNextCollection}</em></tpl>',
'</li>',
'</tpl>',
'<tpl if="values.p.greenGardenWasteDay">',
'<li class="refuse-g icon">',
'<tpl if="values.p.greenGardenWasteDay === \'never\'">There is no green garden waste collection for your property</tpl>',
'<tpl if="values.p.greenGardenWasteDay !== \'never\'">Your green garden waste is collected <strong>{values.p.greenGardenWasteDay}</strong><br /><em class="extra-detail indent-16">Your next green garden waste collection is on {values.p.greenGardenWasteNextCollection}</em></tpl>',
'</li>',
'</tpl>',
'<tpl if="values.p.recyclableWasteDay">',
'<li class="refuse-g icon">',
'<tpl if="values.p.recyclableWasteDay === \'never\'">There is no recyclable waste collection for your property</tpl>',
'<tpl if="values.p.recyclableWasteDay !== \'never\'">Your recyclable waste is collected <strong>{values.p.recyclableWasteDay}</strong><br /><em class="extra-detail indent-16">Your next recyclable waste collection is on {values.p.recyclableWasteNextCollection}</em></tpl>',
'</li>',
'</tpl>',
'</ul>',
'</div>',
'<tpl for="nearest.findAll(function(v) { return v.level3Group === \'services\'; })">',
'<hr />',
layerSubSection,
'</tpl>',
'</div>',
'<div class="c nw"></div><div class="c ne"></div><div class="c sw"></div><div class="c se"></div>',
'</div>',
'<div class="spacer-1em"></div>',
'<div id="myplace-summary-places" class="section">',
'<h3>Your nearest places</h3>',
'<div class="body">',
'<tpl for="nearest.findAll(function(v) { return v.level3Group === \'places\'; })">',
'<tpl if="xindex &gt; 1"><hr /></tpl>',
layerSubSection,
'</tpl>',
'</div>',
'<div class="c nw"></div><div class="c ne"></div><div class="c sw"></div><div class="c se"></div>',
'</div>',
'<div class="spacer-1em"></div>',
'',{
cllr:function(p,i){
var a='href="'+MyPlace.env.modernGovBaseUrl+p['councillorModernGovId'+i]+'" title="'+p['councillorName'+i]+'"';
return'<li><div class="inner-box"><div class="body"><a '+a+' class="councillor-image nolinkprint"><img src="'+MyPlace.env.appPath+'images/councillors/large/'+p['councillorPhoto'+i]+'" width="67" height="100" alt="Councillor '+p['councillorName'+i]+'" /></a><div><a '+a+' class="nolinkprint">'+p['councillorName'+i]+'</a><br /><em class="extra-detail">'+p['councillorPoliticalParty'+i]+'</em></div></div><div class="c nw"></div><div class="c ne"></div><div class="c sw"></div><div class="c se"></div></div></li>';
},
mapLink:function(l,id,t){
return MyPlace.env.mapEnabled?' <span class="noprint">&raquo; <a href="javascript:void(0);" onclick="MyPlace.interface.updateMap({action: \'showballoon\', layer: \''+l+'\', location: '+id+'});" title="Display a map showing the location of '+t+'">map</a></span>':'';
},
layerName:function(v){
return v.features.length!==1?v.displayNameDecapitalized:v.displayNameDecapitalized.depluralize();
},
featureBalloonLink:function(l,id,d){
return'<a href="javascript:void(0);" onclick="MyPlace.interface.showSummaryBalloon(\''+l+'\', '+id+');" title="More information about '+d.htmlEntities()+'" class="nolinkprint">'+d.htmlEntities()+'</a>';
},
feature:function(v){
return'<li class="map-feature" style="background-image: url('+MyPlace.env.appPath+'images/icons/map/'+v.layer+'-key.gif);">'+this.featureBalloonLink(v.layer,v.id,v.name)+(v.distance?' <em class="extra-detail">'+v.distance.toDistance(true)+'</em>':'')+this.mapLink(v.layer,v.id,v.name)+'<div id="myplace-summary-balloon-'+v.layer+'-'+v.id+'" class="myplace-summary-balloon" style="display: none;"></div></li>';
}
}).apply(MyPlace.userLocation);
if($('myplace-summary').visible()){Effect.Fade('myplace-summary-loading',{duration:0.5});}else{$('myplace-summary-loading').hide();}
});
}
}catch(e){MyPlace.e(e,'displaying local places and services');}
},
updateMap:function(c){
var o=Object.clone(c)||{};
try{
if(MyPlace.interface.currentTab!=='map-tab'){MyPlace.interface.tab('map-tab');}
if(o.action==='updateexpanded'){
var r=$$('#layers li.selected');
if(r.length){o.layer=MyPlace.layers.get(r[0].id.replace(/\-li/,''));}else{return;}
if(o.layer.featureSelect||!MyPlace.userLocation.isValid){
MyPlace.callback(MyPlace.interface.updateExpandedLayer,MyPlace.interface,[o],true);
return;
}
}
if(o.action==='showdirections'){
if(!$('myplace-map-hidden-directions')){Element.insert($$('body')[0],{bottom:'<div id="myplace-map-hidden-directions" style="position: absolute; left: -9999px; top: -9999px; display: none;"></div>'});}
if(MyPlace.dir){MyPlace.interface.clearDirections();}
if(MyPlace.map){MyPlace.map.closeInfoWindow();}
}
if(o.layer&&typeof o.layer==='string'){
o.layer=MyPlace.layers.get(o.layer);
if(!o.layer){MyPlace.errors.add({userMessage:'The specified layer \''+c.layer+'\' does not exist',type:'system'});return false;}
}
if(o.location){
if(typeof o.location==='number'){o.location=String(o.location);}
if(typeof o.location==='object'){
o.type='glatlng';
}else if(typeof o.location==='string'){
if(MyPlace.Is.coords(o.location)){
o.location=new GLatLng(o.location.replace(MyPlace.Is.coordsRe,'$1'),o.location.replace(MyPlace.Is.coordsRe,'$2'));
o.type='glatlng';
}else if(MyPlace.Is.uprn(o.location)){
o.location=parseInt(o.location,10);
o.type='uprn';
}else if(MyPlace.Is.int(o.location)){
o.location=parseInt(o.location,10);
o.type='id';
}
}
}
if(o.layer&&!['point','polygon'].include(o.layer.type)){
if(o.action==='toggleexpand'){o.action='togglelayer';}
else if(o.action==='expand'){o.action='enablelayer';}
else if(o.action==='collapse'){o.action='disablelayer';}
}
if(!(/^home|center|bounds|show(?:layer|balloon|directions)|(?:toggle)?expand|collapse|(?:(?:(?:en|dis)able|toggle)(?:layer|feature))$/i).test(o.action)){
if(o.layer){o.action=o.type==='id'?'showballoon':'showlayer';}else{o.action='center';}
}else if(o.action==='togglelayer'){
o.action=((o.fromCheckbox?$(o.layer.name+'-checkbox').checked:!o.layer.visible)?'en':'dis')+'ablelayer';
}else if(o.action==='toggleexpand'){
o.action=$(o.layer.name+'-li').hasClassName('selected')?'collapse':'expand';
}
switch(o.mapType){
case'satellite':o.mapType=G_SATELLITE_MAP;break;
case'hybrid':o.mapType=G_HYBRID_MAP;break;
case'earth':o.mapType=G_SATELLITE_3D_MAP;break;
default:o.mapType=MyPlace.map?MyPlace.map.getCurrentMapType():G_NORMAL_MAP;break;
}
o.zoom=o.zoom&&MyPlace.Is.int(o.zoom)?parseInt(o.zoom,10):MyPlace.map?MyPlace.map.getZoom():['id','uprn'].include(o.type)?15:12;
if(['showlayer','expand'].include(o.action)){o.zoom=o.zoom.constrain(o.layer.minZoom,o.layer.maxZoom);}
o.zoom=o.zoom.constrain(o.mapType.getMinimumResolution(),o.mapType.getMaximumResolution()).constrain(12,21);
if(/(?:en|dis)able(?:layer|feature)/.test(o.action)){
MyPlace.ScrollTo('myplace-main-content',{afterFinish:MyPlace.interface.updateMapCont1.curry(o).bind(MyPlace.interface)});
}else{
MyPlace.callback(MyPlace.interface.updateMapCont1,MyPlace.interface,[o],true);
}
}catch(e){MyPlace.e(e,'updating map');}
},
updateMapCont1:function(o){
try{
var layerLoaded,f;
if(o.layer){
layerLoaded=o.layer.features.length===o.layer.totalFeatures;
f=o.layer.getFeature(o.location);
}
var p=false,b=false,l=false;
if(['showlayer','enablelayer'].include(o.action)&&!layerLoaded){
p={layer:o.layer.name};
b=true;
}else if(['showballoon','showdirections'].include(o.action)&&!f){
p={layer:o.layer.name,filterid:o.location};
}else if(o.action==='bounds'){
var z=MyPlace.map.getZoom();
var ll=MyPlace.layers.findAll(function(v){return v.totalFeatures>v.features.length&&v.visible&&v.maxZoom>=z&&v.minZoom<=z;}).pluck('name').join(',');
if(ll){p={layer:ll};}
b=true;
}else if(['expand','updateexpanded'].include(o.action)){
p={layer:o.layer.name};
b=true;
l=true;
}
if(p){
if(o.action==='expand'){
$(o.layer.name+'-li').addClassName('loading');
$(o.layer.name+'-text-link').innerHTML='<strong>'+o.layer.displayName+'</strong>';
var m=$$('#'+o.layer.name+'-li div.layer-list-loading')[0];
if(m){m.innerHTML='<img src="'+MyPlace.env.interfacePath+'images/loading-layer-list.gif" width="20" height="20" />';m.show();}
}
if(b){
var g=o.type==='glatlng'?o.location:f?new GLatLng(f.lat,f.lng):MyPlace.map?MyPlace.map.getCenter():false;
if(g){
b=MyPlace.interface.getViewBounds(g,o.zoom);
p.bounds=b.getNorthEast().lat()+','+b.getNorthEast().lng()+','+b.getSouthWest().lat()+','+b.getSouthWest().lng();
}
}
if(l&&MyPlace.userLocation.isValid){p.lat=MyPlace.userLocation.lat;p.lng=MyPlace.userLocation.lng;}
MyPlace.ajax({
url:MyPlace.env.appPath+'core/get-locations.asp',
errorMessage:'Error getting map features',
parameters:p,
extra:o,
onSuccess:function(v,t){
MyPlace.callback(MyPlace.interface.updateMapCont2,MyPlace.interface,[t.request.options.extra,v.layers],true);
}
});
}else{
MyPlace.callback(this.updateMapCont2,this,[o],true);
}
}catch(e){MyPlace.e(e,'updating map');}
},
updateMapCont2:function(o,l){
try{
if(l){MyPlace.callback(this.cacheFeatures,this,[o,l],true);}
MyPlace.callback(this.updateMapCont3,this,[o],true);
}catch(e){MyPlace.e(e,'updating map');}
},
updateMapCont3:function(o){
try{
var l=o.layer,f=o.feature;
if(o.type==='glatlng'){
o.center=o.location;
}else if(['id','uprn'].include(o.type)){
o.feature=o.layer.getFeature(o.location);
if(!o.feature){MyPlace.errors.add({userMessage:'Error updating map',message:'Feature id '+o.location+' does not exist in the \''+o.layer.name+'\' layer',type:'system'});return false;}
o.center=new GLatLng(o.feature.lat,o.feature.lng);
if(f&&f.gPolygon){o.zoom=this.getBoundsZoomLevel(this.bufferBounds(f.gPolygon.getBounds(),10));}
}else if(o.action==='home'){
o.center=new GLatLng(MyPlace.userLocation.lat,MyPlace.userLocation.lng);
}else if(MyPlace.map){
o.center=MyPlace.map.getCenter();
}
if(o.action==='showlayer'&&o.layer.features.length===o.layer.totalFeatures){
var b=this.bufferedLayerBounds(o.layer);
o.center=b.getCenter();
o.zoom=o.mapType.getBoundsZoomLevel(b,new GSize($('myplace-map').getWidth(),$('myplace-map').getHeight())).constrain(o.layer.minZoom,Math.min(o.layer.maxZoom,Math.max(o.layer.minZoom,15)));
}
if(o.action==='togglefeature'){
o.action=((o.fromCheckbox?$(o.layer.name+'-'+o.feature.id+'-checkbox').checked:!['visible','forceVisible'].include(o.feature.visibilityStatus))?'en':'dis')+'ablefeature';
}
if(o.action==='enablefeature'){o.feature.visibilityStatusUpdate='visible';}
else if(o.action==='disablefeature'){o.feature.visibilityStatusUpdate='hidden';}
if(!MyPlace.map){MyPlace.callback(this.initMap,this,[o],true);}
MyPlace.callback(this.updateMapCont4,this,[o],true);
}catch(e){MyPlace.e(e,'updating map');}
},
updateMapCont4:function(o){
try{
var l=o.layer,f=o.feature;
if(!o.mapLoaded&&!['disablefeature','showballoon','showdirections'].include(o.action)&&(o.center.lat()!==MyPlace.map.getCenter().lat()||o.center.lng()!==MyPlace.map.getCenter().lng()||o.zoom!==MyPlace.map.getZoom()||o.mapType!==MyPlace.map.getCurrentMapType())){
MyPlace.interface.suspendMapMoveResponse=true;
MyPlace.map.setCenter(o.center,o.zoom,o.mapType);
MyPlace.interface.suspendMapMoveResponse=false;
}
if(['showlayer','enablelayer'].include(o.action)||(o.action==='expand'&&!o.layer.featureSelect)){
l.features.each(function(v){v.visibilityStatusUpdate='visible';});
}else if(o.action==='disablelayer'){
l.features.each(function(v){v.visibilityStatusUpdate='hidden';});
}else if(['showballoon','showdirections'].include(o.action)){
f.visibilityStatusUpdate='forceVisible';
}else if(o.action==='enablefeature'){
f.visibilityStatusUpdate='visible';
}else if(o.action==='disablefeature'){
f.visibilityStatusUpdate='hidden';
}
MyPlace.callback(this.refreshMapOverlays,this,null,true);
MyPlace.callback(this.updateMapCont5,this,[o],true);
}catch(e){MyPlace.e(e,'updating map');}
},
updateMapCont5:function(o){
try{
var l=o.layer,f=o.feature;
if(o.action==='showballoon'){
if(f.gMarker){MyPlace.interface.showBalloon(f.gMarker,null,new GLatLng(f.lat,f.lng));}
else if(f.gPolygon){
MyPlace.map.setCenter(new GLatLng(f.lat,f.lng),MyPlace.map.getBoundsZoomLevel(MyPlace.interface.bufferBounds(f.gPolygon.getBounds(),10)));
MyPlace.interface.showBalloon(f.gPolygon,null,new GLatLng(f.lat,f.lng));
}
}else if(o.action==='showdirections'){
MyPlace.callback(this.showDirections,this,[o],true);
}else if(['expand','updateexpanded'].include(o.action)){
if($(o.layer.name+'-feature-list').visible()){
this.updateExpandedLayer(o);
}else{
MyPlace.callback(this.collapseLayer,this,[o,this.expandLayer.curry(o).bind(this)],true);
}
}else if(o.action==='collapse'){
MyPlace.callback(this.collapseLayer,this,[o],true);
}else if(o.action==='bounds'){
this.updateExpandedLayer(o);
}
if(o.mapLoaded){
if(this.currentTab==='map-tab'){Effect.Fade('myplace-map-loading',{duration:1,delay:1});}else{$('myplace-map-loading').hide();}
MyPlace.callback(this.updateCurrentTab(),this,null,true);
}else{
MyPlace.interface.li.hide();
}
}catch(e){MyPlace.e(e,'updating map');}
},
cacheFeatures:function(o,l){
try{
l.each(function(v){
var layer=MyPlace.layers.get(v.name);
var i=layer.features.pluck('id');
var f=v.features.findAll(function(v){return i.indexOf(v.id)===-1;});
if(layer.type==='point'){
f.each(function(m){
m.gMarker=new GMarker(new GLatLng(m.lat,m.lng),{
icon:layer.gIcon,
title:m.name
});
m.gMarker.layer=layer.name;
m.gMarker.fId=m.id;
});
}else if(layer.type==='polygon'||layer.type==='region'){
f.each(function(m){
m.gPolygon=new GPolygon.fromEncoded({
polylines:m.polygon.collect(function(v){
return{
color:layer.color,
opacity:0.8,
weight:3,
points:v.polyline,
levels:v.levels,
zoomFactor:2,
numLevels:18
};
}),
fill:true,
color:layer.color,
opacity:0.2,
outline:true
});
m.gPolygon.layer=layer.name;
m.gPolygon.fId=m.id;
});
}
f.each(function(v){
v.layer=layer.name;
v.visibilityStatus='new';
if(o.action==='bounds'){v.visibilityStatusUpdate='visible';}
});
layer.features.push.apply(layer.features,f);
if(v.hasDistances){
f=v.features.findAll(function(m){return i.indexOf(m.id)!==-1;});
f.each(function(m){layer.getFeature(m.id).distance=m.distance;});
}
});
}catch(e){MyPlace.e(e,'inserting map features into cache');}
},
initMap:function(o){
try{
MyPlace.map=new GMap2(document.getElementById('myplace-map'));
MyPlace.map.addControl(new GLargeMapControl());
MyPlace.map.addControl(new GMapTypeControl());
MyPlace.map.addControl(new GScaleControl());
MyPlace.map.addControl(new GOverviewMapControl());
this.li=new MapLoadingIndicator(MyPlace.map);
MyPlace.interface.suspendMapMoveResponse=true;
MyPlace.map.setCenter(o.center,o.zoom,o.mapType);
MyPlace.interface.suspendMapMoveResponse=false;
GEvent.addListener(MyPlace.map,'error',function(){MyPlace.interface.googleMapsError(MyPlace.map.getStatus().code);});
GEvent.addListener(MyPlace.map,'moveend',function(){
if(!MyPlace.interface.suspendMapMoveResponse){
if(MyPlace.interface.updateMapTimer){window.clearTimeout(MyPlace.interface.updateMapTimer);}
MyPlace.interface.updateMapTimer=MyPlace.interface.updateMap.curry({action:'bounds'}).delay(1);
}
});
GEvent.addListener(MyPlace.map,'infowindowclose',function(){
$('myplace-balloon-print').innerHTML='';
if(MyPlace.interface.mapUpdatePending){MyPlace.markerManager.refresh();MyPlace.interface.mapUpdatePending=false;}
});
GEvent.addListener(MyPlace.map,'click',MyPlace.interface.showBalloon);
MyPlace.markerManager=new MarkerManager(MyPlace.map,{maxZoom:21});
this.homeMarker(true);
var londonBoundaryPoints='kyfyHqah@gZk@_DsGsTaEmJqJwGof@nAoSwKab@__@|S_L@Swi@{Fes@cK^qDhGoN|@qCeEo`@xVrDak@wKMsChU{BL_OwLhCwReHwE_HdC_DkN{FOj@qK|`AkREcu@s@qEqT}AmIiNoFIcBpGsk@FyRqiE}Mn@sA{SeCk@sI{~Bs@yw@lC_D{BkOkJZqTjNg@tMi]~F}KrOd@lQwFP}FlTwGp@sFhS{o@lLnHbmCmi@zS{KAmE~Jg`@xVaz@x|@eg@pKaKiEeMzAyAjl@yJlu@uQqXgIwAyCe\\gEaHcx@|hAgh@j_B_o@tqA`IpKtRj|@`AxWvGbZ|@tU{Cra@tFr`@wDjEUzMfF\\eHx[xGrEvQleAmEjTeD`w@u@pqBLrOvKrf@pWd^`KtYh@fGuHzJnQdk@xGfc@uDrApChSyObLnJbc@nP}N~NnQ~KyA~FhTlA`JsIbMeD|d@nL~g@_Mt{@{]~|@wHnWfA`B_Ju@aGsHe@{UsEkCuD`GnNblAix@|gAgVll@B@iDkBcFqHiAFgGaBqL{GaDpCiBv@iB?aDmAOXy@bJMTyNZcDn@hCdPXzHBxEa@lIc@pEg@|AuBdXAxFk@vNXfQSDAxGWvDWv@aBbBkFrCU]GvARnChDxNaDnBn@dHClCk@vHyDC@^}CaBm@?ARcC{B{@fGGhBFzDh@f@_@hDb@rCAj@hh@tEch@uEyj@kBek@kPuU~NuoAaFcXhD_LhbEgG~h@~F`p@Cd^gD~Yu^`nAqEv]]|bA_JvcAlSfaBWvuA|RdyAcOntAtb@Vfy@jv@pAj[rB{@xTr`@pCrb@fVdTkGda@qPgJR~XgKjDFvTnM_FgC|TxJzL_EvJvB`G~X}QbHlXeEhGdMv`@kCfBnSfg@h@tC}OlMtHz[oAhQ|G`PlLdu@gCjQjDbAxAaGfm@rK~QpL~LxUgB~NuMlQrEzC`@nZvF]t@t[`ThFdAdm@vGtXjHlaAsD`s@eYhkAnMnRjHfi@~Pbg@hZf`@kGnH`Wzx@hIz_AxYli@xPb|@xC|d@rIxYtNlmBmCbl@eOnb@gBpz@gRtvA`Bz^tYlS|Qpr@i[fjA_]vj@a`@viAaWhTqDpb@rO~QpMmOj[zNlIsSxJcH~YlNh_@xFph@uPbGpCk@~P`EbD`d@qLdL~DjYuVzSuDxQs_@t[cD~L_]dG`HbO}GlVzBfGaJvRKzCuIhGItAcUlMmD|OnCxVza@nHtVlVtQ@~Hv[bBzQ~UzZ_^bDbC|Z_M~N|J|d@aB~PdKvQaOtPIpG}XrTwMtHrJnHkAzO|JpKzRtKgFxQzJrGlZnOnJvBxJfA_CnIjIxFeCr`@h[pr@~NrZrYlDsN_DwMhBo[pGmWvRqRq@iI~H}b@Lmz@|OqUlGqiAvDiPvUrDx@bJfT^RcXxc@ApEyKvVbCqJa|@f^|GjAyp@|Wn@lJi`AwBU[aI_GaAaHku@dAiHpDvB|DqXzCjBfByJ`EfAvBuK`TuMnGgRwEgj@tFkk@bO}YrAdCp^{HK`YbX}Ef@w`@zHuA|Bga@kDy_@cQkr@i@m`@`FaVzDq@rQqa@xVuw@reAgpAj@gQqLaj@pTmUdK|M~BkBkDmRjMoKnAvDj`@uN~G_JfUhF`Dhb@vIhOdpAvPz_@jVzNf[dVnNf\\kOddAhJ`NwBxFvHhHkBnF{N{G}p@}n@{uAsp@{Jg_@c]cW{d@eYkJkVs^cE}BoErNs`@cp@sFuU{ScW_Tep@sWcWvCkm@{Fq^DwSvz@aBrUlDhAaZuBuN|Iu\\cBiEzTie@d`@uWpb@_C`A{Inn@gRxi@dmAvh@gv@{Bij@uPcL}L~EwZg`ARuGeV{VbPuz@`Sye@~Z}l@rRaGe@gMjC_FqCkg@lYpEhPiUsCgKlNaLpLr_@`LwC\\}GzSkLtPpAfC{TnVzLF{KrKdSvRcNqAgKfHcUoA}IxCgN}G}K~FoCdAcIeFkW~NoESuJzQySrLmBvf@}e@_Awd@m`@qUb@mUal@_gBcA|JeGpEqAmGtDgIkDcS_K?mJyNoKd@mTcj@kKWiSlQwLia@qIoAcHap@rMeEp@ud@{Qmo@nAqGcFoRyLeGwDaOgTtEiLnL{HiDiFyr@q]oXzF__@oEqf@jAkZzr@io@}VqTKoVz\\uk@m@cMhsAyYaBqVdb@fKdcAqVzo@yPRqX{^qJ}^_Veb@wr@b\\wt@dI}FnOeH~c@dJmGiU^c^`JcTc@yIdQ{NoLexAuBkz@}E{TqUy_@_U`^i\\pQgEgIe\\|FiHkGaXwAgMyPgPoo@mMoUsKmF{Jo[~CqZ}FuD~AsT}K}H]qLcEIiR}UcE~Hw_@rHf@lFqIvBcPaKcIii@|Aek@lFe[_JvCqGsSk@zCgEaDqMmR{l@eTcAdFa[eAae@yYbCgLwFsAeDbJ}MyB}DbEyHmJf@_DoPkCgMjUgb@_DaRvIgI{DoHjLyBiBXgwAaRhRcs@tW_[nf@}BaBtAsU}NeDiFx[sPuK{MU]sPmCeBsLvRiImI{WmAs[uMbMct@_KoKw^aCim@ac@rDyTuEeJNkHsEmH}A}RwHaMqNeFQ{SeQoKc@y^wOa`@{EcBqB`GwNeCiV{l@yc@kDuOpOgMaRaJ|@yHs\\iSyBSgScMeU}Obi@sDlh@';
var londonBoundaryLevels='PFEEHEEHEHDHEEEFHGFDGFFEEEJFHIEEGEEIGFDFEEFFLEFGEEEDEGIIEGEEGEEHDIEFDIFEKEDDGDEEDEFGEHDEBHEEGEFDFEFFHGFFGEEFKEDDHEFFEGHE?ICDBDGBEBEAAEBICAEBABDACBBAGACCFACEECAFCDCBCFBAHCBAFJCEGFELEFDGDDFEHFEGJGHFDEFGGFEFHGEEEGGHEEFBFGEEDEIEEGEIEGEEEFGEDHEHEEFGFEFEFEDJEEEHFFHEEFGFOGGDGEGGEEFEIEFFFGFEEEGEEEJFDEEFFIFEGEFGEFFIEEEFFGEEGEEEFFLEEFEGDEFFDIFEGGFEIGGGHGDEFHEEEEEEEEGEIGEFGHEFGDEHDEEFHEKGFEGEEEIFEGGEEIGEFGEMFHGEEFGEFHEDFGEDKEHDEEFHEFFIJGHFGDFHEFFGDDJGFEGHEEFFGFFGIEDDFFDEHEEFEKFGFGDFDEHEEFGEGEHFFGDDHEGEFHGKEEGGFGEIGGGBJGEFIEGFIEGEEGDLEHEHFFEIEEEEGFEEEIDGEEEGHFDGFEECIFEFFGEEEGDEHFFEFIDIEFHDFGGEFDGGEJGHEEGFDDDFEEFFEIEEGGFFEHFFEIEP';
MyPlace.boroughPolygon=new GPolygon.fromEncoded({
polylines:[{
color:'#FFFFFF',
opacity:1,
weight:2,
points:'gbyyH|cKwAa@{C_D{DqIyBeGy@sA{C}B{AsDyDsDeCq@sA}@cJoOq@Iq@RaFnDaBt@}DD_Ck@mFiCqIuA{CoDyDw@kDsBuMuRqEgFmO_OwO}JuAqA{@kBsKs_@oAaCiCgCkA_@{APkItGs@V_BA}DiAsSgQkK{OiTgX_MuFgFyEq}@qp@aCgAwBUsAaAcN{Eih@uE@k@c@sC^iDi@g@G{DFiBz@gGbCzB@Sl@?|C`BA_@xDBj@wHBmCo@eH`DoBiDyNSoCFwAT\\jFsC`BcBVw@VwD@yGREYgQj@wN@yFtBeXf@}Ab@qE`@mICyEY{HiCePbDo@xN[LUx@cJNY`DlAhB?hBw@`DqCpLzGfG`BhAGbFpHhDjBg@vAd@HSz@f@TfAm@R~AnB`@bAUbA~Bn@B\\m@pAP\\hAXU`AlA|@Or@lATc@Xn@|AFn@n@x@AXw@^nBz@aAxAlAt@zAd@pAQt@Dj@lAH`@xCbAZXa@b@v@j@ZPfAEn@x@v@z@lCASdAy@n@K`Df@BbBk@`J?~CZzCi@~ATTYnA@bCTbAfIed@tBkI|Zo]nBs@zBl@Pi@pBz@Gl@Vd@hA@bAp@?j@fEdCF_@pAj@Fj@|By@_@pAPPfIpEJa@@Xf@N~ArBr\\zTjGpDhUpAlQbBjBE?SlCOf@]|ALpj@mERI`AoCDmGnA^xBB~A_Ad@`AJCpMsEh@y@jI{CtQR|@XfFnDtAcF~AiBw@kDjNi@E|@o@dBDzAV`@vQgG`BJfAr@bAvBXnBF`RdRl@rJa@zFqAD{BRkB|@mD|@mBvCkErIeKlEmEFNp@g@|BlJ~ExOm@n@d@~AcJfIpEvQ}AbBbEjHdFiFfDbG`@KnAnQd@dDE^OB_Cm@sAL@`Ba@BNXTvFc@FFzA]FvA|XrChPs@b@tC~MdBfNIXiCx@aEVsBz@{A|EJjA|@tDhAdKdAxR`@G?n@cK~@kDvATVOFiEjAaLj[SzDuFjA{BrBqCjEuElNw@hDItDXpCjBfIJvC[fCeBbGi@zEB`Cv@`FBfCIl@}AxCUnAdAfHLtCeA`GDnDIlAgBtCS~C}@`C]Ty@E}BqBmAUq@HaDpCyBnEgC|CkFbJyBpHmAvCcIpEi@zAQfFYdAuCtBwEjHsFxAiJvFyHjCmGhDqB~AoAR',
levels:'PBDACBCDCBDGACADFBCDCBGBDCAFADBGBDAEBGDBFDBGBBBEJABBCCAFCBCDCGACEECAFCCAFABBCADBABEACLBEAAEBEBFDBHCDBCEBDDBDDBBDCBBCDCBBCBDDEBCBACCDCCACACBEABDGACACBBBAIBFCICBDBCCBCBCBDEBDCCABCAFBHBBBBBFACFBCCAEBBFDAFCDFHACAFDBFBDFCHEACAEACBBKAFCDFDFEECFAGACBEBCACBBFCCDBFBBBDFAACBBIDBBBFCECECGBDABDBBDBADAADAECADCBHACBEBFBBCADEBBDCFCBBABP',
zoomFactor:2,
numLevels:18
},{
color:'#FFFFFF',
opacity:1,
weight:2,
points:londonBoundaryPoints,
levels:londonBoundaryLevels,
zoomFactor:2,
numLevels:18
}],
fill:true,
color:'#666666',
opacity:0.2,
outline:true
});
MyPlace.map.addOverlay(MyPlace.boroughPolygon);
MyPlace.boroughPolygon=new GPolygon.fromEncoded({
polylines:[{
color:'#666666',
opacity:1,
weight:2,
points:londonBoundaryPoints,
levels:londonBoundaryLevels,
zoomFactor:2,
numLevels:18
},{
color:'#666666',
opacity:1,
weight:2,
points:'cdzlJntljA?exeiBb~seA??dxeiBc~seA?',
levels:'PPPPP',
zoomFactor:2,
numLevels:18
}],
fill:true,
color:'#000000',
opacity:0.35,
outline:true
});
MyPlace.map.addOverlay(MyPlace.boroughPolygon);
o.mapLoaded=true;
}catch(e){MyPlace.e(e,'initializing map');}
},
refreshMapOverlays:function(){
try{
MyPlace.layers.each(function(l){
var f=l.features.findAll(function(v){return v.visibilityStatusUpdate;});
if(l.type==='point'){
f.each(function(v){
if(v.visibilityStatusUpdate==='visible'){
MyPlace.markerManager.addMarker(v.gMarker,l.minZoom,l.maxZoom);
v.visibilityStatus='visible';
}else if(v.visibilityStatusUpdate==='forceVisible'){
try{MyPlace.markerManager.removeMarker(v.gMarker);}catch(e1){}
MyPlace.markerManager.addOverlay_(v.gMarker);
}else{
try{MyPlace.markerManager.removeMarker(v.gMarker);}catch(e2){}
}
});
}else if(l.type==='polygon'||l.type==='region'){
f.each(function(v){if(v.visibilityStatusUpdate==='forceVisible'){v.visibilityStatusUpdate='visible';}if(v.visibilityStatusUpdate==='visible'){MyPlace.map.addOverlay(v.gPolygon);}else{MyPlace.map.removeOverlay(v.gPolygon);}});
}
f.each(function(v){v.visibilityStatus=v.visibilityStatusUpdate;v.visibilityStatusUpdate=null;});
if(l.featureSelect&&$(l.name+'-li').hasClassName('selected')){
$$('#layers li.selected .checkbox').each(function(v){v.checked=['visible','forceVisible'].include(l.getFeature(parseInt(v.id.substr(v.id.indexOf('-')+1,v.id.lastIndexOf('-')-v.id.indexOf('-')-1),10)).visibilityStatus);});
}
l.visible=!!l.features.find(function(v){return v.visibilityStatus==='visible';});
$(l.name+'-checkbox').checked=l.visible;
});
MyPlace.callback(MyPlace.interface.refreshMap,this,null,true);
MyPlace.callback(MyPlace.interface.updateLayerVisibilityNotices,this,null,true);
}catch(e){MyPlace.e(e,'initializing map');}
},
updateLayerVisibilityNotices:function(){
try{
MyPlace.interface.notices.remove('layers-near');
MyPlace.interface.notices.remove('layers-far');
MyPlace.interface.notices.remove('layers-position');
var b=MyPlace.map.getBounds();
var bn=b.getNorthEast().lat(),be=b.getNorthEast().lng(),bs=b.getSouthWest().lat(),bw=b.getSouthWest().lng();
MyPlace.layers.each(function(l){
l.visibilityStatus='';
l.visibilityWarning='';
vf=l.features.findAll(function(v){return v.visibilityStatus==='visible';});
if(l.visible||vf.length){
if(MyPlace.map.getZoom()>l.maxZoom){
l.visibilityStatus='near';
l.visibilityWarning='You are zoomed in too close to view this layer. Try zooming out';
}else if(MyPlace.map.getZoom()<l.minZoom){
l.visibilityStatus='far';
l.visibilityWarning='You are zoomed in out to far view this layer. Try zooming in';
}else if((l.type==='point'&&!vf.find(function(f){return f.lat.within(bn,bs)&&f.lng.within(be,bw);})||((l.type==='polygon'||l.type==='region')&&!vf.find(function(f){return f.maxLat>bs&&f.minLat<bn&&f.maxLng>bw&&f.minLng<be;})))){
l.visibilityStatus='position';
l.visibilityWarning=(l.type==='region'?l.displayName+' is not':l.visible?'There are no '+l.displayNameDecapitalized:'None of the selected '+l.displayNameDecapitalized+' are')+' within the current map view. Try moving the map or zooming out';
}
}
$$('#'+l.name+'-li span.visibility-warning').each(function(el){
el.innerHTML=l.visibilityStatus?'<a href="javascript:void(0);" onclick="MyPlace.ScrollTo(\'interactive-map\');" title="'+l.visibilityWarning+'" class="nolinkprint"><img src="'+MyPlace.env.appPath+'images/icons/16/warning.gif" width="16" height="16" alt="'+l.visibilityWarning+'" /></a>':'';
if(l.visibilityStatus){el.show();}else{el.hide();}
});
});
var near=MyPlace.layers.findAll(function(l){return l.visibilityStatus==='near';}).pluck('displayNameDecapitalized');
var far=MyPlace.layers.findAll(function(l){return l.visibilityStatus==='far';}).pluck('displayNameDecapitalized');
var position=MyPlace.layers.findAll(function(l){return l.visibilityStatus==='position';}).pluck('displayNameDecapitalized');
if(near.length){near[0]=near[0].substring(0,1).toUpperCase()+near[0].substring(1);MyPlace.interface.notices.add({id:'layers-near',message:near.join(', ').replace(/, (?!.*,)/,' and ')+' are not shown because you are zoomed too far in. Try zooming out'});}
if(far.length){far[0]=far[0].substring(0,1).toUpperCase()+far[0].substring(1);MyPlace.interface.notices.add({id:'layers-far',message:far.join(', ').replace(/, (?!.*,)/,' and ')+' are not shown because you are zoomed too far out. Try zooming in'});}
if(position.length){MyPlace.interface.notices.add({id:'layers-position',message:'There are no '+position.join(', ').replace(/, (?!.*,)/,' or ')+' in the current map view. Try moving the map or zooming out'});}
MyPlace.interface.notices.display();
}catch(e){MyPlace.e(e,'whilst checking for invisible layers');}
},
expandLayer:function(o){
try{
$(o.layer.name+'-li').addClassName('selected');
$(o.layer.name+'-text-link').innerHTML='<strong>'+o.layer.displayName+'</strong>';
this.updateExpandedLayer(o);
Effect.SlideDown($(o.layer.name+'-feature-list'),{queue:'end',duration:0.3,afterFinish:function(){
var p=$$('#'+o.layer.name+'-li div.layer-list-loading')[0];
if(p){p.innerHTML='';p.hide();}
$(o.layer.name+'-li').removeClassName('loading');
}.curry(o)});
}catch(e){MyPlace.e(e,'expanding layer');}
},
collapseLayer:function(o,c){
var r=$$('#layers li.selected');r=r.length?r[0].id.replace(/\-li/,''):false;
if(r){
var el=$(r+'-feature-list'),f=function(){
$(r+'-li').removeClassName('selected');
$(r+'-text-link').innerHTML=o.layer.displayName;
$(r+'-feature-list').innerHTML='';
if(c){MyPlace.callback(c,MyPlace.interface,[o],true);}
}.curry(o,c,r);
if(el.down()&&el.visible()){
Effect.SlideUp(el,{queue:'end',duration:0.3,afterFinish:f});
}else{
el.hide();
f();
}
}else if(c){MyPlace.callback(c,MyPlace.interface,[o],true);}
},
updateExpandedLayer:function(o){
try{
var l=o?o.layer:false;
if(!l){
var r=$$('#layers li.selected');if(r.length){l=MyPlace.layers.get(r[0].id.replace(/\-li/,''));}
if(!l){return;}
}
if(l.sortOrder==='alphabetical'||!MyPlace.userLocation.isValid){
var b=MyPlace.map.getBounds();
l.listFeatures=(l.features.length<l.limit?l.features:l.features.findAll(function(v){return b.containsLatLng(new GLatLng(v.lat,v.lng));})).sort(function(a,b){return a.name<b.name?-1:a.name>b.name?1:0;});
}else{
l.listFeatures=l.features.sort(function(a,b){return!a.distance?!b.distance?0:b:a.distance<b.distance?-1:a.distance>b.distance?1:0;}).slice(0,l.limit);
}
$(l.name+'-feature-list').innerHTML=new MyPlace.XTemplate([
'<div class="inner">',
'<tpl if="values.visibilityStatus && values.sortOrder === \'nearest\' && !MyPlace.userLocation.isValid">',
'<div class="tip"><p class="warning icon">The places in this category cannot be shown because {visibilityWarning:decapitalize}</p></div>',
'</tpl>',
'<tpl if="!values.visibilityStatus || values.sortOrder !== \'nearest\' || MyPlace.userLocation.isValid">',
'<tpl if="values.sortOrder === \'nearest\'">',
'<tpl if="MyPlace.userLocation.isValid">',
'<h4>Your nearest {displayNameDecapitalized}:</h4>',
'</tpl>',
'<tpl if="!MyPlace.userLocation.isValid">',
'<div class="tip"><p class="help icon"><a href="javascript:void(0);" onclick="MyPlace.interface.highlightAddressSearch();" class="nolinkprint">Set your location</a> to make this a list of <strong><em>your</em></strong> nearest {displayNameDecapitalized}.</p></div>',
'<h4>{displayName} near map:</h4>',
'</tpl>',
'</tpl>',
'<tpl if="values.sortOrder === \'alphabetical\'"><h4>Alphabetical list:</h4></tpl>',
'<ul>',
'<tpl for="listFeatures">',
'<li>',
'<tpl if="parent.featureSelect"><input id="{parent.name}-{id}-checkbox" name="{parent.name}-{id}-checkbox" type="checkbox" onclick="MyPlace.interface.updateMap({action: \'togglefeature\', layer: \'{parent.name}\', location: {id}});"<tpl if="[\'visible\', \'forcedVisible\'].include(values.visibilityStatus)"> checked="checked"</tpl> class="checkbox" /></tpl>',
'<div class="feature-name<tpl if="!parent.featureSelect"> pin-g icon</tpl>">',
'<a href="javascript:void(0);" onclick="MyPlace.interface.updateMap({action: \'showballoon\', layer: \'{parent.name}\', location: {id}});">{name:strip(parent.featureNameStrip)}</a>',
'<tpl if="MyPlace.userLocation.isValid && parent.sortOrder === \'nearest\'"> <em class="extra-detail nowrap">{distance:toDistance}</em></tpl>',
'</div>',
'<br class="cl hide-in-ie" />',
'</li>',
'</tpl>',
'</ul>',
'</tpl>',
'</div>'
]).apply(l);
}catch(e){MyPlace.e(e,'expanding layer');}
},
homeMarker:function(noCenter){
try{
if(MyPlace.homeMarker){MyPlace.map.removeOverlay(MyPlace.homeMarker);MyPlace.homeMarker=null;}
if(MyPlace.dir){MyPlace.interface.clearDirections();}
MyPlace.interface.li.hide();
if(!MyPlace.userLocation.isValid){return false;}
var p=new GLatLng(MyPlace.userLocation.lat,MyPlace.userLocation.lng);
if(!noCenter){MyPlace.interface.updateMap({action:'home',zoom:15});}
MyPlace.homeMarker=new GMarker(p,{
icon:new GIcon({
image:MyPlace.env.appPath+'images/icons/map/home.png',
shadow:MyPlace.env.appPath+'images/icons/map/home-shadow.png',
iconSize:new GSize(26,26),
shadowSize:new GSize(44,28),
iconAnchor:new GPoint(13,26),
infoWindowAnchor:new GPoint(13,0),
transparent:MyPlace.env.appPath+'images/icons/map/home-transparent.png',
imageMap:[0,11,11,0,15,0,18,3,19,1,22,1,23,3,23,8,26,11,26,14,23,15,23,26,15,26,15,18,11,18,11,26,3,26,3,15,0,14]
}),
title:'My Place ('+MyPlace.userLocation.address+')'
});
MyPlace.homeMarker.fId='home';
MyPlace.map.addOverlay(MyPlace.homeMarker);
MyPlace.interface.notices.display();
}catch(e){MyPlace.e(e,'displaying home marker on the map');}
},
showBalloon:function(o,p,op){
var a=function(){
try{
var html;
if(o&&o.layer&&typeof o.fId==='number'){
var l=MyPlace.layers.get(o.layer);
var f=l.getFeature(o.fId);
MyPlace.log('/feature-info/'+o.layer+'/'+escape(f.name),'ha');
var z=MyPlace.map.getZoom().constrain(l.minZoom,l.maxZoom);
if(MyPlace.map.getZoom()!==z){MyPlace.map.setZoom(z);}
var a=function(){
try{
html=l.template.apply(f).replace(/class="footer"/,'class="footer external-white"');
var opts={maxWidth:500};
$('myplace-balloon-print').innerHTML=html;
if(o.openInfoWindowHtml){o.openInfoWindowHtml(html,opts);}else{MyPlace.map.openInfoWindowHtml(op,html,opts);}
}catch(e){MyPlace.e(e,'displaying information window');}
}.bind(this).defer();
MyPlace.interface.lastClickedFeature={layer:o.layer,id:o.fId};
}else if(o&&o.fId==='home'){
MyPlace.log('/feature-info/home','ha');
html=new MyPlace.XTemplate(
'<div class="home"><div class="balloon">',
'<div class="header">',
'<div class="inner"><h3>Your Place in Waltham Forest</h3></div>',
'</div>',
'<div class="content">',
'<img class="map" src="http://maps.google.co.uk/staticmap?center={lat},{lng}&zoom=18&maptype=satellite&size=200x200&key='+GOOGLE_MAPS_API_KEY+'" width="200" height="200" alt="Satellite photo showing the location of {address}" />',
'<div class="detail">',
'<strong>{address}</strong>',
'<ul class="noprint">',
'<li class="list-g icon"><a href="javascript:void(0);" onclick="MyPlace.interface.tab(\'summary-tab\');" class="nolinkprint">Places and services near me</a></li>',
'<li class="locate-g icon bad-location">Is this location wrong?<br /><a href="#" onclick="MyPlace.reportBadLocation(); return false;" class="nolinkprint">Tell us</a></li>',
'</ul>',
'</div>',
'</div>',
'<div class="footer"><div class="inner">&nbsp;</div></div>',
'</div></div>').apply(MyPlace.userLocation);
$('myplace-balloon-print').innerHTML=html;
o.openInfoWindowHtml(html,{maxWidth:400});
}
}catch(e){MyPlace.e(e,'displaying information window');}
}.bind(this);
if($('myplace-map').viewportOffset().top<0){MyPlace.ScrollTo('myplace-main-content',{queue:'end',afterFinish:a});}else{a();}
},
showDirections:function(o){
try{
var f=o.feature;
MyPlace.dirFeature=f;
MyPlace.dir=new GDirections(MyPlace.map,$('myplace-map-hidden-directions'));
MyPlace.dirTravelMode=o.travelMode;
GEvent.addListener(MyPlace.dir,'load',function(){
try{
if(MyPlace.dir.getNumRoutes()){
var r=MyPlace.dir.getRoute(0);
$('myplace-directions').innerHTML=new MyPlace.XTemplate('<div id="text-directions">',
'<h3 class="printonly">'+(MyPlace.dirTravelMode==='w'?'Walking':'Driving')+' Directions</h3>',
'<table summary="'+(MyPlace.dirTravelMode==='w'?'Walking':'Driving')+' directions to {toName}" cellpadding="0" cellspacing="0" border="0">',
'<caption class="rm">'+(MyPlace.dirTravelMode==='w'?'Walking':'Driving')+' directions to {toName}</caption>',
MyPlace.dirTravelMode==='w'?'<tr class="disclaimer"><td colspan="4"><p class="warning icon"><strong>Walking directions are in beta.</strong><br />Use caution – This route may be missing pavements or pedestrian paths.</p></td></tr>':'',
'<tr class="start"><td colspan="4">',
'<div class="marker printonly">',
'<tpl if="!MyPlace.browser.isIElte6">',
'<img src="{startImage}" width="26" height="26" alt="Start marker" />',
'</tpl>',
'<tpl if="MyPlace.browser.isIElte6">',
'<img src="{spacerImage}" width="26" height="26" alt="Start marker" style="filter: progid:DXImageTransform.Microsoft.AlphaImageLoader(src=\'{startImage}\', sizingMethod=\'scale\');" />',
'</tpl>',
'</div>',
'<div class="p">',
'<p><strong>From: {fromName} ({fromAddress})</strong></p>{distance:toDistance} <span class="duration">({duration:toTime})</span>',
'<a href="javascript:void(0);" onclick="MyPlace.interface.clearDirections();" class="noprint">Clear these directions</a>',
'</div>',
'</td></tr>',
'<tpl for="steps">',
'<tr class="step" onclick="MyPlace.ScrollTo(\'myplace-map\', {afterFinish: function() { MyPlace.map.showMapBlowup(new GLatLng({lat}, {lng}))}}); return false;">',
'<td class="step-number"><a href="javascript:void(0);" class="nolinkprint">{#}.</a></td>',
'<td class="description"><a href="javascript:void(0);" class="nolinkprint">{description}</a></td>',
'<td class="distance">{distance:toDistance}</td>',
'<td class="duration">{duration:toShortTime}</td>',
'</tr>',
'</tpl>',
'<tr class="end"><td colspan="4">',
'<tpl if="endImage">',
'<div class="marker">',
'<tpl if="!MyPlace.browser.isIElte6">',
'<img src="{endImage}" width="24" height="34" alt="End marker" />',
'</tpl>',
'<tpl if="MyPlace.browser.isIElte6">',
'<img src="{spacerImage}" width="24" height="34" alt="End marker" style="filter: progid:DXImageTransform.Microsoft.AlphaImageLoader(src=\'{endImage}\', sizingMethod=\'scale\');" />',
'</tpl>',
'</div>',
'</tpl>',
'<p><strong>To: {toName}</strong><br />{toAddress}</p>',
'</td></tr>',
'</table>',
'</div>').apply({
summary:r.getSummaryHtml(),
startLatLng:{lat:r.getStep(0).getLatLng().lat(),lng:r.getStep(0).getLatLng().lng()},
endLatLng:{lat:r.getEndLatLng().lat(),lng:r.getEndLatLng().lng()},
steps:$R(0,r.getNumSteps()-1).collect(function(v){return r.getStep(v);}).collect(function(v){return{lat:v.getLatLng().lat(),lng:v.getLatLng().lng(),polylineIndex:v.getPolylineIndex(),description:v.getDescriptionHtml(),distance:v.getDistance().meters/1000,duration:v.getDuration().seconds};}),
distance:r.getDistance().meters/1000,
duration:r.getDuration().seconds,
fromName:'My home address',
fromAddress:MyPlace.userLocation.address,
toName:MyPlace.dirFeature.name,
toAddress:MyPlace.dirFeature.address?MyPlace.dirFeature.address:r.getEndGeocode().address,
startImage:MyPlace.env.appPath+'images/icons/map/home.png',
endImage:MyPlace.layers.get(MyPlace.dirFeature.layer).type==='point'?MyPlace.env.appPath+'images/icons/map/'+MyPlace.dirFeature.layer+'.png':'',
spacerImage:MyPlace.env.appPath+'images/spacer.gif'
});
MyPlace.trHover();
}else{
MyPlace.errors.add({userMessage:'No route information was provided by Google',type:'system'});
}
MyPlace.interface.li.setContent('<img src="'+MyPlace.env.appPath+'images/icons/20/arrow-down-b.gif" width="20" height="20" /><span><a href="javascript:void(0);" onclick="MyPlace.ScrollTo(\'myplace-directions\'); MyPlace.interface.li.hide(true);" class="nolinkprint">Text directions</a> shown below map</span>');
MyPlace.interface.li.show(true);
}catch(e){MyPlace.e(e,'displaying directions');}
});
GEvent.addListener(MyPlace.dir,'addoverlay',function(o){
try{
if(MyPlace.dir.getNumGeocodes()){
MyPlace.map.removeOverlay(MyPlace.dir.getMarker(0));
MyPlace.map.removeOverlay(MyPlace.dir.getMarker(MyPlace.dir.getNumGeocodes()-1));
var b=MyPlace.interface.bufferBounds(MyPlace.dir.getPolyline().getBounds(),20);
if(!MyPlace.map.getBounds().containsBounds(b)){MyPlace.map.setCenter(b.getCenter(),MyPlace.map.getBoundsZoomLevel(b));}
}
}catch(e){MyPlace.e(e,'displaying directions');}
});
GEvent.addListener(MyPlace.dir,'error',function(){MyPlace.interface.googleMapsError(MyPlace.dir.getStatus().code);});
MyPlace.dir.loadFromWaypoints([MyPlace.userLocation.lat+','+MyPlace.userLocation.lng,f.lat+','+f.lng],{
locale:'en_GB',
travelMode:o.travelMode==='w'?G_TRAVEL_MODE_WALKING:G_TRAVEL_MODE_DRIVING,
getPolyline:true,
getSteps:true
});
}catch(e){MyPlace.e(e,'getting directions');}
},
clearDirections:function(){
if(!MyPlace.dir){return;}
MyPlace.interface.li.hide(true);
MyPlace.log('/clear-directions','ha');
$('myplace-directions').innerHTML='';
MyPlace.dir.clear();
delete MyPlace.dir;
if(MyPlace.dirFeature){
MyPlace.markerManager.removeMarker(MyPlace.dirFeature.gMarker);
var l=MyPlace.layers.get(MyPlace.dirFeature.layer);
MyPlace.markerManager.addMarker(MyPlace.dirFeature.gMarker,l.minZoom,l.maxZoom);
MyPlace.interface.refreshMap();
}
},
getDirectionsLinks:function(f){
try{
var v=f||MyPlace.interface.lastClickedFeature;
if(!v){MyPlace.errors.add({userMessage:'Error generating directions links',message:'No destination map feature was specified',type:'system'});return false;}
if(MyPlace.userLocation.isValid){
return['',
'<ul>',
'<li class="first walking-wg icon"><a href="javascript:void(0);" onclick="MyPlace.interface.updateMap({action: \'showdirections\', layer: \''+v.layer+'\', location: '+v.id+', travelMode: \'w\'});" class="nolinkprint" title="Get walking directions to '+v.name+'">Walking</a></li>',
'<li class="public-transport-wg icon"><a href="'+MyPlace.directionsLink(v,'p')+'" class="external" title="Get public transport directions to '+v.name+' (external site)" target="_blank">Public transport</a></li>',
'<li class="driving-wg icon"><a href="javascript:void(0);" onclick="MyPlace.interface.updateMap({action: \'showdirections\', layer: \''+v.layer+'\', location: '+v.id+', travelMode: \'d\'});" class="nolinkprint" title="Get driving directions to '+v.name+'">Driving</a></li>',
'</ul>'].join('');
}else{
return'<div class="tip"><a href="javascript:void(0);" onclick="MyPlace.interface.highlightAddressSearch();" class="nolinkprint">Set your location</a> to see directions links here</div>';
}
}catch(e){MyPlace.e(e,'generating directions links');}
},
showSummaryBalloon:function(l,id){
try{
if(MyPlace.interface.currentTab!=='summary-tab'){return;}
var o=l;
if(typeof o==='string'){o=MyPlace.layers.get(l);}
if(o){
f=MyPlace.userLocation.nearest.find(function(v){return v.name===o.name;}.bind(this)).features.find(function(v){return v.id===id;}.bind(this));
if(f){
var el=$('myplace-summary-balloon-'+o.name+'-'+f.id);
if(el){
if(!el.visible()){
el.innerHTML=[
'<div>',
'<div class="callout-arrow"></div>',
'<div class="inner-box">',
o.template.apply(f).replace(/\-wg/g,'-g'),
'<div class="c nw"></div><div class="c ne"></div><div class="c sw"></div><div class="c se"></div>',
'</div>',
'</div>'
].join('');
Effect.SlideDown(el,{queue:'end',duration:0.5});
}else{
Effect.SlideUp(el,{queue:'end',duration:0.5,afterFinish:function(ef){ef.element.innerHTML='';}});
}
}else{MyPlace.errors.add({userMessage:'Error displaying information window',message:'Balloon DOM element not found',type:'system'});}
}else{MyPlace.errors.add({userMessage:'Error displaying information window',message:'Feature id '+id+' does not exist in the \''+l+'\' layer',type:'system'});}
}else{MyPlace.errors.add({userMessage:'Error displaying information window',message:'\''+l+'\' layer does not exist',type:'system'});}
}catch(e){MyPlace.e(e,'displaying information window');}
},
refreshMap:function(){
if(MyPlace.map.getInfoWindow().isHidden()){MyPlace.log('/refresh-map','h');MyPlace.markerManager.refresh();}else{MyPlace.log('/refresh-map-pending','h');MyPlace.interface.mapUpdatePending=true;}
},
googleMapsError:function(c){
var s;
switch(c){
case G_GEO_BAD_REQUEST:s='A directions request could not be successfully parsed.';break;
case G_GEO_SERVER_ERROR:s='A geocoding or directions request could not be successfully processed.';break;
case G_GEO_MISSING_QUERY:s='The HTTP q parameter was either missing or had no value';break;
case G_GEO_UNKNOWN_ADDRESS:s='No corresponding geographic location could be found for the specified address';break;
case G_GEO_UNAVAILABLE_ADDRESS:s='The geocode for the given address or the route for the given directions query cannot be returned due to legal or contractual reasons.';break;
case G_GEO_UNKNOWN_DIRECTIONS:s='The GDirections object could not compute directions between the points mentioned in the query';break;
case G_GEO_BAD_KEY:s='The Google Maps API key is either invalid or does not match the domain for which it was given.';break;
case G_GEO_TOO_MANY_QUERIES:s='The MyPlace site has gone over the Google Maps requests limit in the 24 hour period or has submitted too many requests in too short a period of time.';break;
}
MyPlace.errors.add({userMessage:'Google Maps has encountered a problem',message:s,type:'system',number:c});
return false;
},
bufferedLayerBounds:function(l){
try{
if(l.type==='point'){
return MyPlace.interface.bufferBounds(new GLatLngBounds(new GLatLng(l.features.pluck('lat').min(),l.features.pluck('lng').min()),new GLatLng(l.features.pluck('lat').max(),l.features.pluck('lng').max())),20);
}else if(l.type==='polygon'||l.type==='region'){
return MyPlace.interface.bufferBounds(new GLatLngBounds(new GLatLng(l.features.pluck('minLat').min(),l.features.pluck('minLng').min()),new GLatLng(l.features.pluck('maxLat').max(),l.features.pluck('maxLng').max())),20);
}
}catch(e){MyPlace.e(e,'getting buffered layer bounds');}
},
bufferBounds:function(b,p){
try{
var bn=b.getNorthEast().lat(),be=b.getNorthEast().lng(),bs=b.getSouthWest().lat(),bw=b.getSouthWest().lng();
return new GLatLngBounds(new GLatLng(bs-((bn-bs)*(p/100)),bw-((be-bw)*(p/100))),new GLatLng(bn+((bn-bs)*(p/100)),be+((be-bw)*(p/100))));
}catch(e){MyPlace.e(e,'getting buffered map bounds');}
},
getViewBounds:function(l,z,p){
try{
if(!p){p=G_NORMAL_MAP.getProjection();}
var w=$('myplace-map').getWidth()/2;
var h=$('myplace-map').getHeight()/2;
var c=p.fromLatLngToPixel(l,z);
return new GLatLngBounds(p.fromPixelToLatLng(new GPoint(c.x-w,c.y+h),z),p.fromPixelToLatLng(new GPoint(c.x+w,c.y-h),z));
}catch(e){MyPlace.e(e,'getting map bounds for current view');}
},
getBoundsZoomLevel:function(b){
return G_NORMAL_MAP.getProjection().getBoundsZoomLevel(b,new GSize($('myplace-map').getWidth(),$('myplace-map').getHeight()));
},
notices:Object.extend([],{
add:function(config){
try{
var notice=new MyPlace.interface.Notice(config);
MyPlace.log('/map-notice/'+notice.id,'h');
this.push(notice);
return notice;
}catch(e){MyPlace.e(e,'creating map notice');}
},
remove:function(id){
var i=this.find(function(v){return v.id.toLowerCase()===id.toLowerCase();});
if(i){this.splice(this.indexOf(i),1);}
},
get:function(id){
return this.find(function(v){return v.id.toLowerCase()===id.toLowerCase();})||false;
},
display:function(){
try{
MyPlace.log('/display-map-notices','h');
this.el=$('myplace-map-notices');
var u=function(){
var t=this.length===0?'':new MyPlace.XTemplate('<ul><tpl for="."><li>{message}</li></tpl></ul>').apply(this);
this.el.innerHTML=t;
}.bind(this);
if(this.el.visible()){
if(this.length===0){Effect.SlideUp(this.el,{queue:'end',duration:0.5,afterFinish:u});}
else{u();}
}else{
if(this.length>0){u();Effect.SlideDown(this.el,{queue:'end',duration:0.5});}
else{u();}
}
}catch(e){MyPlace.e(e,'displaying map notices');}
}
}),
Notice:Class.create({
initialize:function(config){
var c=config;
if(typeof c==='string'){c={message:c};}
MyPlace.applyConfig(this,(c||{}),{
id:String.random(10),
message:''
});
}
})
};