/* See license.txt for terms of usage */

define(["firebug/lib/domplate"], function(Domplate) {

// ********************************************************************************************* //
// Constants

Firebug.BalloonNote = function(doc, object)
{
    this.initialize(doc, object);
};

with (Domplate) {
Firebug.BalloonNote.prototype = domplate(
{
    tag:
        DIV({"class": "balloon", onclick: "$onClick"},
            DIV({"class": "balloonTop1"},
                DIV({"class": "balloonTop2"})
            ),
            DIV({"class": "balloonInner1"},
                DIV({"class": "balloonInner2"},
                    DIV({"class": "balloonInner3"},
                        DIV({"class": "balloonInner4"},
                            SPAN({"class": "balloonCloseButton closeButton",
                                onclick: "$onCloseAction"}),
                            DIV({"class": "balloonContent"},
                                TAG("$cause|getContentTag", {cause: "$cause"})
                            )
                        )
                    )
                )
            ),
            DIV({"class": "balloonBottom1"},
                DIV({"class": "balloonBottom2"})
            )
        ),

    getContentTag: function(object)
    {
        return DIV(object.message);
    },

    onCloseAction: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function(doc, object)
    {
        // xxxHonza: TODO: this object should implement the whole show/hide logic
        // move from Firebug.BreakNotification
    }
});
};

// ********************************************************************************************* //
});
