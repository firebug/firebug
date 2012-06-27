<?php
    setcookie("TestCookie39", "CookieValue;39", time() + 86400, "/firecookie/tests/issue39");
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Issue 39: Can't create cookies with ';' in it</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<div class="topBar">
    <a href="http://code.google.com/p/firecookie/issues/detail?id=39">Issue 39</a>
</div>
<h1>Issue 39: Can't create cookies with ';' in it</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and enable the <b>Cookies</b> panel.</li>
</ol>

<button onclick="onExecuteTest()">Execute Test</button>

<script type="text/javascript">
function onExecuteTest()
{
}
</script>

</body>
</html>
