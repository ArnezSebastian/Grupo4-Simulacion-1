//Función para elegir un valor aleatorio en base a un mínimo y un máximo dados por parámetro:
function elegirValorAleatorioEntre(valMin, valMax) {
    //Serciorarse que el valor sea finalmente un entero:
    const min = Math.ceil(valMin);
    const max = Math.floor(valMax);

    //Retorna el valor entero entre esos valores:
    return Math.floor(Math.random() * (max - min + 1)) + min;
}