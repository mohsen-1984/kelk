# فرمول‌ها — Formulas

مورد 1 (simple arrows): $a\to b,\ a\leftarrow b,\ a\mapsto b,\ A\Rightarrow B,\ A\:\Longleftrightarrow\:B$ پایان.

Case 2 (long arrows): $\longrightarrow\ \longleftarrow\ \Longrightarrow\ \Longleftrightarrow\ \longmapsto$ پایان.

مورد 3 (extensible arrows):

$$
A\xrightarrow{f}B\xleftarrow[g]{\text{long label}}C
$$

Case 4 (hook/twohead/misc): $\hookrightarrow\ ↠\ ⇝\ ↗\ \rightleftharpoons\ ⇆$ پایان.

مورد 5 (reaction): $\ce{H2O -> H+ + OH-}$ پایان.

Case 6 (equilibrium + condition):

$$
\ce{N2 + 3H2 <=>[\text{Fe}] 2NH3}
$$

مورد 7 (ions and states): $\ce{CuSO4 . 5H2O},\ \ce{Ca^{2+}},\ \ce{A_{(aq)} + B_{(s)}}$ پایان.

Case 8 (accents): $\hat{x}\ \bar{x}\ \vec{v}\ \dot{x}\ \ddot{x}\ \tilde{x}\ \mathring{A}$ پایان.

مورد 9 (wide accents): $\widehat{xyz}\ \widetilde{abc}\ \overline{x+y}\ \underline{a+b}\ \overrightarrow{AB}\ \overleftarrow{CD}$ پایان.

Case 10 (braces):

$$
\overbrace{a+\cdots+a}^{n}\ \underbrace{b+\cdots+b}_{m}
$$

مورد 11 (over/under set):

$$
\overset{\text{def}}{=}\ \underset{x}{\mathrm{argmax}}\ \overset{?}{=}\ \underset{\theta}{\arg\,\min}L
$$

Case 12 (limits):

$$
\lim_{x\to 0}\frac{\sin x}{x}=1,\ \sum_{\begin{matrix} i=1 \\ i\ne j \end{matrix}}^{n}a_{i},\ \prod_{k=1}^{\infty}
$$

مورد 13 (inline fractions): $\frac{TP}{TP+FP}=\frac{1}{2},\ \frac{a+b}{c}$ پایان.

Case 14 (nested fraction (inline: script sizes, as TeX)): $\frac{\frac{a}{b}}{\frac{c}{d}}\ne\frac{\frac{a}{b}}{\frac{c}{d}}$ پایان.

مورد 15 (fractions):

$$
\frac{a}{b}\ \frac{a}{b}\ \frac{a}{b}\ (\genfrac{}{}{0pt}{}{n}{k})\ \frac{1}{1+\frac{1}{1+x}}
$$

Case 16 (roots): $\sqrt{x}\ \sqrt[3]{x+1}\ \sqrt{\frac{a}{b}}$ پایان.

مورد 17 (delimiters):

$$
\left( \frac{a}{b} \right)\ \left[ x \right]\ \left\{ y \right\}\ \left\langle v \right\rangle\ ⌊x⌋\ ⌈x⌉\ \|x\|
$$

Case 18 (sized + one-sided):

$$
((((\ {\frac{df}{dx}|}_{x=0}
$$

مورد 19 (bmatrix/vmatrix):

$$
\begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}\ \begin{vmatrix} a & b \\ c & d \end{vmatrix}\ \begin{Vmatrix} x \end{Vmatrix}
$$

Case 20 (array with rules):

$$
\begin{bmatrix} 1 & 2 & 3 \\ 4 & 5 & 6 \end{bmatrix}
$$

مورد 21 (dots):

$$
\begin{pmatrix} a_{11} & \cdots & a_{1n} \\ \vdots & \ddots & \vdots \\ a_{m1} & \cdots & a_{mn} \end{pmatrix}
$$

Case 22 (smallmatrix): $\begin{pmatrix} a & b \\ c & d \end{pmatrix}$ پایان.

مورد 23 (align):

$$
\begin{aligned} f(x) & =(x+1)^{2} \\ & =x^{2}+2x+1 \end{aligned}
$$

Case 24 (gather + tag):

$$
\begin{matrix} a=b \\ c=d \end{matrix}\tag{1}
$$

مورد 25 (cases):

$$
f(x)=\begin{cases} x^{2} & x\ge 0 \\ -x & x<0 \end{cases}
$$

Case 26 (cancel family): $\cancel{a}\ \bcancel{b}\ \xcancel{c}\ {\cancel{x}}^{0}$ پایان.

مورد 27 (boxed): $\boxed{E=mc^{2}}\ \boxed{\text{text}}$ پایان.

Case 28 (alphabets): $\mathbb{R}\ \mathcal{L}\ \mathfrak{g}\ \mathcal{F}\ \mathsf{A}\ \mathtt{x}\ \mathbf{v}\ \boldsymbol{\alpha}\ \mathrm{d}x$ پایان.

مورد 29 (greek): $\alpha\beta\gamma\delta\epsilon\epsilon\theta\vartheta\lambda\mu\pi\sigma\phi\phi\omega\ \Gamma\Delta\Theta\Lambda\Sigma\Phi\Psi\Omega$ پایان.

Case 30 (integrals):

$$
\int_{a}^{b}\ \iint\ \iiint\ \oint_{C}\ \int\limits_{0}^{1}
$$

مورد 31 (symbols): $\partial\ \nabla\ \infty\ \forall\ \exists\ \in\ \notin\ \subset\ \supseteq\ \cup\ \cap\ \emptyset\ \ne\ \le\ \ge\ \approx\ \equiv\ \sim\ \propto\ \pm\ \times\ \cdot\ \circ$ پایان.

Case 32 (mod + functions): $a\equiv b\;(\bmod\:n),\ a\bmod n,\ \sin\theta\ \log_{2}n\ \exp(x)\ \max_{i}\ \det A$ پایان.

مورد 33 (color): $x+y$ پایان.

Case 34 (primes + spacing): $f'(x),\ f''(x),\ a\,b\:c\quad d\quad ef$ پایان.

مورد 35 (phantom + not): $\phantom{x}y,\ ⊄,\ \ne$ پایان.

Case 36 (text Persian):

$$
\text{اگر }x>0\text{ آنگاه }y=1
$$

مورد 37 (units (siunitx-like)): $9.81\,\mathrm{m}/{\mathrm{s}}^{2},\ 25{\,}^{\circ}\mathrm{C}$ پایان.
