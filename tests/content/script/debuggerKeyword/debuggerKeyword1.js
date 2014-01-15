/* test source for xhr then eval() with debugger keyword */
var a = 44;
var b = 33;

function foo()
{
    console.log("hi");
    var x = 1;
    var y = 2;
}

function bar()
{
    debugger;   //@debuggerXHRRow - don't remove this comment
}


//debugger;
bar();
var c = 22;
var d = 11;
var e = 0;
