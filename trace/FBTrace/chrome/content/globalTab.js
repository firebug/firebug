/* See license.txt for terms of usage */

define([
    "fbtrace/lib/domplate",
    "fbtrace/trace",
    "fbtrace/lib/dom",
    "fbtrace/lib/object",
    "fbtrace/lib/menu",
],
function(Domplate, FBTrace, Dom, Obj, Menu) {
with (Domplate) {

// ********************************************************************************************* //
// Shorcuts and Services

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

Cu["import"]("resource://fbtrace/firebug-trace-service.js");

//********************************************************************************************** //

var GlobalTab = domplate(
{
    tag:
        DIV({onclick: "$onClick", role: "list"},
            FOR("topic", "$topics",
                BUTTON({"class": "traceOption"},
                    "$topic"
                )
            )
        ),

    render: function(parentNode)
    {
        if (FBTrace.DBG_FBTRACE)
            FBTrace.sysout("globalTab; render topics " + topics.length, topics);

        var input = {
            topics: topics,
            onClick: Obj.bind(this.toggleTopic, this)
        };

        this.tag.replace(input, parentNode);
    },

    toggleTopic: function(event)
    {
        var topicElt = event.target;

        if (!this.isObserved(topicElt))
            this.addTopic(topicElt)
        else
            this.removeTopic(topicElt);
    },

    forEachTopicElement: function(fn)
    {
        var topicDivs = Dom.getElementsByClass(this.panelNode, "traceOption")
        for (var i=0; i<topicDivs.length; i++)
        {
            var topicElt = topicDivs[i];
            fn(topicElt);
        }
    },

    allTopics: function(add)
    {
        var self = this;
        this.forEachTopicElement(function addIfTrue(topicElt)
        {
            try
            {
                if (add)
                    self.addTopic(topicElt);
                else
                    self.removeTopic(topicElt);

                if (FBTrace.DBG_FBTRACE)
                {
                    FBTrace.sysout("AllTopics add: "+add+" isObserved "+self.isObserved(topicElt)+
                        " "+topicElt.innerHTML);
                }
            }
            catch (exc)
            {
                if (FBTrace.DBG_FBTRACE)
                {
                    FBTrace.sysout("FBTrace; globalObserver allTopics fails for " +
                        topicElt.innerHTML + " " + exc, exc);
                }
            }
        });
    },

    isObserved: function(topicElt)
    {
        var topic = topicElt.innerHTML;
        var observers = observerService.enumerateObservers(topic);
        if (!observers)
        {
            if (FBTrace.DBG_FBTRACE)
                FBTrace.sysout("isObserved no observers of topic " + topic);

            return false;
        }

        while (observers.hasMoreElements())
        {
            var x = observers.getNext();
            if (x.wrappedJSObject == GlobalObserver)
            {
                if (FBTrace.DBG_FBTRACE)
                    FBTrace.sysout("isObserved found FBTrace.globaleObserver of topic " + topic, x);
                return true;
            }
        }

        if (FBTrace.DBG_FBTRACE)
            FBTrace.sysout("isObserved no observers of topic " + topic + " match GlobalObserver");

        return false;
    },

    addTopic: function(node)
    {
        var topic = node.innerHTML;
        observerService.addObserver(GlobalObserver, topic, false);
        node.setAttribute("checked", "true");

        if (FBTrace.DBG_FBTRACE)
            FBTrace.sysout("FBTrace; GlobalObserver addObserver "+topic);
    },

    removeTopic: function(node)
    {
        var topic = node.innerHTML;
        observerService.removeObserver(GlobalObserver, topic);
        node.removeAttribute("checked");

        if (FBTrace.DBG_FBTRACE)
            FBTrace.sysout("FBTrace; GlobalObserver removeObserver " + topic);
    },

    getOptionsMenuItems: function()
    {
        var items = [
            {label: "All On", command: Obj.bindFixed(this.allTopics, this, true)},
            {label: "All Off", command: Obj.bindFixed(this.allTopics, this, false)},
            Menu.optionMenu(GlobalObserver.shoutOptionLabel, GlobalObserver.shoutOptionName),
        ];
        return items;
    },

    updateOption: function(name, value)
    {
        if (name == GlobalObserver.shoutOptionName)
            GlobalObserver.shoutOptionValue = (value?true:false); // force to boolean
    },
});

//********************************************************************************************** //

var GlobalObserver =
{
    observe: function(subject, topic, data)
    {
        var localTrace = traceConsoleService.getTracer(TraceConsole.prefDomain);

        // Log info into the tracing console.
        var shout = (GlobalObserver.shoutOptionValue ? "globalObserver." : "");
        localTrace.sysout(shout + "observe: " + topic, {subject:subject, data: data});

        if (topic == "domwindowopened")
        {
            try
            {
                if (subject instanceof Ci.nsIDOMWindow)
                {
                    if (FBTrace.DBG_FBTRACE)
                    {
                        FBTrace.sysout("FBTrace; globalObserver found domwindowopened " +
                            subject.location);
                    }
                }
            }
            catch (exc)
            {
                FBTrace.sysout("FBTrace; globalObserver notify console opener FAILED ", exc);
            }
        }

        // Apparently this event comes before the unload event on the DOMWindow
        else if (topic == "domwindowclosed") 
        {
            if (subject instanceof Ci.nsIDOMWindow)
            {
                if (FBTrace.DBG_FBTRACE)
                {
                    FBTrace.sysout("FBTrace; globalObserver found domwindowclosed " +
                        subject.location);
                }

                if (subject.location.toString() == "chrome://fbtrace/content/traceConsole.xul")
                    throw new Error("FBTrace; globalObserver should not find traceConsole.xul");
            }
        }

        // subject appears to be the nsIDOMWindow with a location that is invalid and
        // closed == true; data null
        else if (topic == "dom-window-destroyed")
        {
            if (FBTrace.DBG_FBTRACE)
            {
                FBTrace.sysout("FBTrace; globalObserver found dom-window-destroyed subject:",
                    subject);
            }
        }
    },

    shoutOptionName: "shoutAboutObserverEvents",
    shoutOptionLabel: "Shout About Observer Events",
    shoutOptionValue: true,
};

// and eye of newt
GlobalObserver.wrappedJSObject = GlobalObserver;

//********************************************************************************************** //

var topics = [
    "Migration:Ended",
    "Migration:ItemAfterMigrate",
    "Migration:ItemBeforeMigrate",
    "Migration:Started",
    "a11y-init-or-shutdown",
    "accessible-event",
    "addons-message-notification",
    "agent-sheet-added",
    "agent-sheet-removed",
    "app-handler-pane-loaded",
    "browser-search-engine-modified",
    "browser-ui-startup-complete",
    "browser:purge-session-history",
    "cacheservice:empty-cache",
    "chrome-flush-caches",
    "chrome-flush-skin-caches",
    "cookie-changed",
    "cookie-rejected",
    "cycle-collector-begin",
    "dl-cancel",
    "dl-start",
    "dom-storage-changed",
    "dom-storage-warn-quota-exceeded",
    "domwindowclosed",
    "domwindowopened",
    "dom-window-destroyed",
    "download-manager-remove-download",
    "dummy-observer-created",
    "dummy-observer-item-added",
    "dummy-observer-visited",
    "earlyformsubmit",
    "em-action-requested",
    "final-ui-startup",
    "formhistory-expire-now",
    "http-on-examine-cached-response",
    "http-on-examine-merged-response",
    "http-on-examine-response",
    "http-on-modify-request",
    "idle-daily",
    "memory-pressure",
    "net:clear-active-logins",
    "network:offline-status-changed",
    "offline-app-removed",
    "offline-cache-update-added",
    "offline-cache-update-completed",
    "offline-requested",
    "page-info-dialog-loaded",
    "passwordmgr-found-form",
    "passwordmgr-found-logins",
    "passwordmgr-storage-changed",
    "perm-changed",
    "places-database-locked",
    "places-init-complete",
    "plugins-list-updated",
    "prefservice:after-app-defaults",
    "private-browsing",
    "profile-after-change",
    "profile-approve-change",
    "profile-before-change",
    "profile-change-net-restore",
    "profile-change-net-teardown",
    "profile-change-teardown",
    "profile-do-change",
    "quit-application",
    "quit-application-forced",
    "quit-application-granted",
    "quit-application-requested",
    "session-save",
    "sessionstore-state-write",
    "sessionstore-windows-restored",
    "shell:desktop-background-changed",
    "shutdown-cleanse",
    "signonChanged",
    "signonSelectUser",
    "sleep_notification",
    "softkb-change",
    "system-display-dimmed-or-off",
    "system-display-on",
    "user-interaction-active",
    "user-interaction-inactive",
    "user-sheet-added",
    "user-sheet-removed",
    "wake_notification",
    "xmlparser",
    "xpcom-category-entry-added",
    "xpcom-shutdown",
    "xpcom-shutdown-loaders",
    "xpcom-shutdown-threads",
    "xpinstall-download-started",
    "xpinstall-install-blocked",
    "xul-overlay-merged",
    "xul-window-destroyed",
    "xul-window-registered"
];

//********************************************************************************************** //

return GlobalTab;

//********************************************************************************************** //
}});
