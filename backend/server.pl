% ===============================================
%  server.pl - Tower of Hanoi backend (SWI-Prolog)
%  Run with:  swipl server.pl
%  Test with: http://localhost:8000/solve?disks=3
% ===============================================

:- use_module(library(http/thread_httpd)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_json)).
:- use_module(library(http/http_parameters)).
:- use_module(library(http/http_cors)).
:- use_module(library(settings)).
:- use_module(library(http/http_files)).

% Allow any website (our frontend) to call this API.
:- set_setting(http:cors, [*]).

% Route: /solve  ->  handle_solve/1
:- http_handler(root(solve), handle_solve, []).

% Route: everything else -> files from the ../frontend folder.
% (So the website AND the API run from one server, which Render needs.)
:- dynamic frontend_dir/1.
:- prolog_load_context(directory, Dir),
   absolute_file_name('../frontend', Front,
                      [relative_to(Dir), file_type(directory)]),
   assertz(frontend_dir(Front)).

:- http_handler(root(.), serve_frontend, [prefix]).

serve_frontend(Request) :-
    frontend_dir(Dir),
    http_reply_from_files(Dir, [], Request).
serve_frontend(Request) :-
    http_404([], Request).

% -----------------------------------------------
%  hanoi(+N, +Pegs, -Moves, ?Rest)
%  Pegs = pegs(From, To, Via)
%  Moves is a difference list: Moves = [m1, m2, ... | Rest]
% -----------------------------------------------

% Base case: 0 disks means no moves.
hanoi(0, _, Moves, Moves) :- !.

% Recursive case:
%  1. move N-1 disks From -> Via   (using To as helper)
%  2. move the biggest disk From -> To
%  3. move N-1 disks Via -> To     (using From as helper)
hanoi(N, pegs(From, To, Via), Moves, Rest) :-
    N > 0,
    M is N - 1,
    hanoi(M, pegs(From, Via, To), Moves, [move(From, To)|Middle]),
    hanoi(M, pegs(Via, To, From), Middle, Rest).

% solve(+N, -Moves): all moves as dicts, ready for JSON.
solve(N, Moves) :-
    hanoi(N, pegs(left, right, middle), Terms, []),
    maplist(move_to_dict, Terms, Moves).

move_to_dict(move(From, To), _{from: From, to: To}).

% -----------------------------------------------
%  HTTP handler for GET /solve?disks=N
% -----------------------------------------------
handle_solve(Request) :-
    cors_enable(Request, [methods([get, options])]),
    (   catch(http_parameters(Request, [disks(N, [integer])]), _, fail),
        between(1, 8, N)
    ->  solve(N, Moves),
        length(Moves, Total),
        reply_json_dict(_{disks: N, total: Total, moves: Moves})
    ;   reply_json_dict(_{error: "disks must be an integer from 1 to 8"},
                        [status(400)])
    ).

% -----------------------------------------------
%  Start the server
% -----------------------------------------------
% Render gives us the port in the PORT environment variable.
% On your own computer there is no PORT, so we use 8000.
start_server :-
    (   getenv('PORT', Text), atom_number(Text, Port)
    ->  true
    ;   Port = 8000
    ),
    http_server(http_dispatch, [port(Port)]),
    format("Hanoi server running at http://localhost:~w~n", [Port]),
    format("Website: http://localhost:~w/~n", [Port]),
    format("API test: http://localhost:~w/solve?disks=3~n", [Port]).

:- initialization(start_server).