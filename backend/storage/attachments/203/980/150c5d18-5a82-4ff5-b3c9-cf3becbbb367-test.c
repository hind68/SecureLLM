#include <stdio.h>

int main() {
    int a, b, somme;

    printf("Entrez le premier nombre : ");
    scanf("%d", &a);

    printf("Entrez le deuxieme nombre : ");
    scanf("%d", &b);

    somme = a + b;

    printf("La somme est : %d\n", somme);

    return 0;
}