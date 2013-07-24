<?php
header("Content-Type: text/html");

class Params
{
    private $params = Array();

    public function __construct()
    {
        $this->_parseParams();
    }

    public function getAll()
    {
        if (isset($this->params))
        {
            return $this->params;
        }
        else
        {
            return null;
        }
    }

    private function _parseParams()
    {
        $method = $_SERVER['REQUEST_METHOD'];
        if ($method == "PUT" || $method == "DELETE")
        {
            parse_str(file_get_contents('php://input'), $this->params);
            $GLOBALS["_{$method}"] = $this->params;
            // Add these request vars into _REQUEST, mimicking default behavior, PUT/DELETE will override existing COOKIE/GET vars
            $_REQUEST = $this->params + $_REQUEST;
        }
        else if ($method == "GET")
        {
            $this->params = $_GET;
        }
        else if ($method == "POST")
        {
            $this->params = $_POST;
        }
    }
}

$params = new Params();
print_r($params->getAll());

?>

