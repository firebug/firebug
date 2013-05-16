<?php
    setcookie("issue4979", "test");
?>

<!DOCTYPE html>
<html>
<head>
    <title>Group console messages: cookies</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
    <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
</head>
<body>
<header>
    <h1><a href="http://code.google.com/p/fbug/issues/detail?id=4979">Group console messages</a>:
        cookies</h1>
</header>
<div>
    <section id="description">
        <h3>Steps to reproduce</h3>
        <ol>
            <li>Open Firebug, enable the Cookies and Console panels</li>
            <li>Select the Console panel</li>
            <li>Make suer <i>Show Cookie Events</i> option is on.</li>
            <li>Press the test button
                <button id="testButton" onclick="onExecuteTest()">Cookie Events</button></li>
            <li>There should be three entries in the Console. Only the last one has the
            group counter set to <b>2</b></li>
        </ol>
    </section>
    <footer>
        Jan Odvarko &lt;odvarko@gmail.com&gt;
    </footer>
</div>

<script>
function onExecuteTest()
{
    // The two cookie changes must be grouped
    // (keep the code at the one line)
    deleteCookie("issue4979"); setCookie("issue4979", "value"); setCookie("issue4979", "value"); setCookie("issue4979", "value");
}

function deleteCookie(name)
{
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

function setCookie(name, value)
{
    document.cookie = name + "=" + escape(value);
}
</script>

</body>
</html>
