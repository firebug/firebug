
if (!top.console || !top.console.firebug)
{
    top.console = {
        log: function() {},
        time: function() {},
        timeEnd: function() {}
    }
}

function ddd()
{
	console.log.apply(console, arguments);
}

function dir()
{
	console.dir.apply(console, arguments);
}

function $(id)
{
    return document.getElementById(id);
}